// O SERVIDOR DE MUNDO da Masmorra (02/10/2026) — o MMO: um mapa só para todos
// e o save do personagem guardado AQUI. Usado só pelo server.js (rotas `/__mundo/*`).
//
// É o `rede-local.mjs` crescido: o mesmo cano (SSE para ouvir, POST para falar,
// porque o navegador não aceita conexões), mas em vez de uma sala de dois que
// só repete o que ouve, ele sabe QUEM é cada um e para quem cada recado vai:
//
//   quem entra ──POST /__mundo/entrar (token da conta)──► bilhete + personagem + estado do mundo
//   cada página ──SSE /__mundo/ouvir──◄ recados dos outros e do servidor
//   cada página ──POST /__mundo/falar──► pos, mundo, golpe, dano, evento…
//   cada página ──POST /__mundo/personagem──► o save (só aqui: não há cópia local)
//
// **Quem simula os inimigos é um dos CLIENTES** — o "simulador", como o dono do
// mundo no co-op (js/rede/coop.js). O servidor não roda o jogo: ele ESCOLHE o
// simulador (o mais antigo com a janela à vista), troca quando ele some, trava
// ou esconde a janela, guarda o último retrato do mundo para quem chega e para
// quem assume, e ROTEIA:
//
//   pos      → todos os outros
//   mundo    → todos os outros (só o simulador pode mandar)
//   golpe    → só o simulador (ele é quem aplica)
//   dano     → só o alvo (`carga.para`; só o simulador pode mandar)
//   evento   → do simulador: todos (ou `carga.para`); dos outros: só `proj`
//   acao     → só o simulador (abrir porta, acordar chefe…)
//   voz      → só `carga.para` (a sinalização do chat de voz; o som vai direto entre os dois, WebRTC)
//   chat     → todos, com o nome e o código carimbados AQUI (quem manda não escolhe o próprio nome)
//
// E `POST /__mundo/ice` entrega as credenciais do retransmissor (TURN) da voz —
// a quem tem bilhete ou conta (ver `turnDaVoz`).
//
// **O estado que sobrevive** (`mundo/estado.json`): portas, névoa, quando cada
// chefe volta, quando cada inimigo renasce. Quem o escreve é o simulador (vem
// dentro do `mundo`, campo `est`); o servidor só guarda e entrega — mundo vazio
// e servidor reiniciado não perdem a porta aberta nem o relógio do chefe.
//
// **Contas**: o token é o da conta do Supabase (o mesmo login do jogo), e o
// servidor o confere em `/auth/v1/user` — o id que vale é o que o Supabase
// diz, nunca o que o cliente diz. `MUNDO_AUTH=teste` aceita `teste:<Nome>` no
// lugar do token, para duas janelas na mesma máquina sem conta (NUNCA ligado
// por padrão: com ele qualquer um entra com o nome que quiser).
//
// **Personagens (18/11/2026)**: quem está no mundo é o PERSONAGEM escolhido, não a conta.
// O id que viaja entre os jogadores é o do personagem (a conta nunca sai daqui: só a
// moderação liga um ao outro), e o servidor confere que ele é da conta do token antes de
// dar o bilhete. Continua valendo uma sessão por conta. Com contas de verdade, a lista de
// personagens mora no Supabase e o jogo fala direto com ele (migration 0006); no modo de
// teste não há Supabase, e `POST /__mundo/perfis` faz o papel dele, com as mesmas regras.
//
// **Sem disco (`MUNDO_SAVES=nuvem`)**: as plataformas grátis que rodam o Node
// por nós (o Render) APAGAM o disco a cada reinício. Nesse modo o servidor não
// lê nem grava arquivo nenhum: o personagem mora no Supabase
// (`masmorra.personagens`, lido e gravado pelo próprio jogo — ver `rede/mundo.js`)
// e o estado do mundo fica só na memória, zerando quando o servidor dorme.
//
// **O que isto NÃO é**: à prova de trapaça. Quem simula é um cliente, e o save
// é o que o cliente manda. O servidor confere FORMATO e LIMITES (um save de
// nível 9999 ou um recado de 5 MB não passam), não a honestidade de ninguém.
// Desde 24/11/2026 ele confere também as REGRAS do balanceamento que dá para conferir
// sem rodar o combate (`regras-do-mundo.mjs`): ninguém anda mais rápido que o jogo
// deixa (o `pos` é cortado) e golpe acima do teto da arma não chega ao simulador.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { criarRegras } from './regras-do-mundo.mjs';
import { lerMapaLogico } from './mapa-do-servidor.mjs';

const QUEM = 'masmorra-do-carrasco';
/** Sobe quando o protocolo muda de um jeito que cliente e servidor antigos não se entendem. */
export const VERSAO_MUNDO = 2;

const MAX_JOGADORES = Number(process.env.MUNDO_MAX) || 16;
const MAX_RECADO = 96 * 1024;
const MAX_SAVE = 256 * 1024;
/** Recados por segundo por jogador; o que passa disso é descartado. */
const RITMO_MAX = 120;
/** Simulador sem mandar `mundo` por isto, com outro jogador podendo assumir: troca. */
const SEM_MUNDO_MS = Number(process.env.MUNDO_SEM_MUNDO_MS) || 2500;
/** A página caiu (recarregou, a rede piscou): por isto o lugar dela fica guardado. */
const CARENCIA_MS = Number(process.env.MUNDO_CARENCIA_MS) || 8000;
/** Quem foi trocado por estar travado só volta a ser candidato depois disto. */
const CASTIGO_MS = 15_000;
const GRAVAR_ESTADO_MS = 2000;

const ID = /^[\w-]{1,64}$/;
const BILHETE = /^[0-9a-f]{48}$/;
/** O id de um personagem: ele vira nome de arquivo, então só passa na forma exata (minúsculas). */
const ID_PERSONAGEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Quantos personagens cada conta pode ter (no Supabase, o gatilho da migration 0006). */
const MAX_PERSONAGENS = 4;
const ALFABETO_CODIGO = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_CHAT = 500;
/** Entre uma mensagem de chat e a próxima do mesmo jogador. */
const CHAT_MS = 400;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

/**
 * Cria o servidor de mundo. `raiz` = a pasta do jogo (de onde saem o nome do
 * mapa e os dados do Supabase); os arquivos ficam em `MUNDO_DIR` ou `raiz/mundo`.
 * Devolve `{ atender(req, res, urlPath), fechar() }`.
 */
export function criarMundo(raiz) {
  const pasta = process.env.MUNDO_DIR ? path.resolve(process.env.MUNDO_DIR) : path.join(raiz, 'mundo');
  const pastaPersonagens = path.join(pasta, 'personagens');
  const arqEstado = path.join(pasta, 'estado.json');
  const arqPerfis = path.join(pasta, 'perfis-teste.json');
  const modoAuth = process.env.MUNDO_AUTH === 'teste' ? 'teste' : 'supabase';
  /** 'disco' = personagens e estado em arquivo, aqui; 'nuvem' = nada em disco (ver o cabeçalho). */
  const saves = process.env.MUNDO_SAVES === 'nuvem' ? 'nuvem' : 'disco';
  const supabase = lerSupabase(raiz);
  const mapa = lerNomeDoMapa(raiz);
  // o MAPA LÓGICO (as mesmas colisões do jogo: mapa-do-servidor.mjs). Sem ele, o passo não confere a parede
  let mapaLogico = null;
  try { mapaLogico = lerMapaLogico(raiz); } catch (e) { console.error('[mundo] sem o mapa lógico (o passo não confere a parede):', e.message); }
  /** O que se confere no `pos` e no `golpe` (o balanceamento como REGRA: regras-do-mundo.mjs). */
  const regras = criarRegras(raiz, { mapa: mapaLogico, avisar: (j, motivo) => avisarRegra(j, motivo) });
  /** Anota (no log do servidor, no máximo uma linha a cada 10 s por jogador) quem passou de uma regra. */
  function avisarRegra(j, motivo) {
    const r = (j.regra ??= { n: 0, em: 0 }), agora = Date.now();
    r.n++;
    if (agora - r.em < 10000) return;
    r.em = agora;
    console.log(`[regra] ${j.nome} #${j.codigo}: ${motivo} (${r.n}ª vez nesta sessão)`);
  }

  /** id do personagem → jogador: `{id, conta, nome, codigo, bilhete, res, entrou, visivel, conectado, caiuEm, lentoAte, ultimoMundo, ritmo, chatEm}` */
  const jogadores = new Map();
  const porBilhete = new Map();
  /** conta → jogador: uma sessão por conta, seja qual for o personagem */
  const porConta = new Map();
  /** Só no modo de teste: conta → `[{id, nome, codigo, aparencia, criado_em}]` (ver `perfis`). */
  const perfisTeste = new Map(saves === 'disco' && modoAuth === 'teste' ? Object.entries(lerJson(arqPerfis) ?? {}) : []);
  let simulador = null;        // id de quem simula os inimigos, ou null (mundo vazio)
  let ultimoMundo = null;      // o último `mundo` do simulador, para quem chega e para quem assume
  let estado = saves === 'disco' ? lerJson(arqEstado) ?? null : null;
  let estadoSujo = false;

  // ------------------------------------------------------------ respostas

  const json = (res, code, obj) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS });
    res.end(JSON.stringify(obj));
  };
  const erro = (res, code, motivo) => json(res, code, { ok: false, erro: motivo });

  function lerCorpo(req, max) {
    return new Promise((ok) => {
      let corpo = '', estourou = false;
      req.setEncoding('utf8');
      req.on('data', (c) => { corpo += c; if (corpo.length > max) { estourou = true; req.destroy(); } });
      req.on('end', () => { if (estourou) return ok(undefined); try { ok(JSON.parse(corpo)); } catch { ok(undefined); } });
      req.on('error', () => ok(undefined));
      req.on('close', () => { if (estourou) ok(undefined); });
    });
  }

  // ------------------------------------------------------------ o cano

  const escrever = (j, de, evento, carga) => {
    if (!j?.conectado || !j.res) return;
    j.res.write(`data: ${JSON.stringify({ de, evento, carga })}\n\n`);
  };
  const para = (id, de, evento, carga) => escrever(jogadores.get(id), de, evento, carga);
  const paraOutros = (de, evento, carga) => { for (const j of jogadores.values()) if (j.id !== de) escrever(j, de, evento, carga); };
  const paraTodos = (evento, carga) => { for (const j of jogadores.values()) escrever(j, 'servidor', evento, carga); };
  const lista = () => [...jogadores.values()].filter((j) => j.conectado).map((j) => ({ id: j.id, nome: j.nome, codigo: j.codigo }));

  // ------------------------------------------------------------ o simulador

  /**
   * Escolhe quem simula: o mais antigo que está ligado, com a janela à vista e
   * sem castigo. Sem nenhum assim, o mais antigo ligado (janela escondida não
   * desenha quadro, mas é melhor um mundo lento que um mundo sem dono).
   */
  function eleger() {
    const agora = Date.now();
    const ligados = [...jogadores.values()].filter((j) => j.conectado).sort((a, b) => a.entrou - b.entrou);
    const bons = ligados.filter((j) => j.visivel && j.lentoAte < agora);
    const atual = jogadores.get(simulador);
    // quem já simula e continua bom fica: trocar à toa é um tranco para todos
    const novo = atual && bons.includes(atual) ? atual : (bons[0] ?? (atual && ligados.includes(atual) ? atual : ligados[0]) ?? null);
    const id = novo?.id ?? null;
    if (id === simulador) return;
    simulador = id;
    if (novo) novo.ultimoMundo = agora;   // o relógio do cão de guarda começa agora
    // Mundo VAZIO: o retrato dos inimigos morre com ele (quem chegar daqui a uma
    // hora não pode herdar uma luta congelada). O `estado` — portas, relógios — fica.
    else ultimoMundo = null;
    paraTodos('sim', { id, mundo: ultimoMundo, estado });
    console.log(`[mundo] simulador: ${novo ? `${novo.nome} (${id})` : 'ninguém (mundo vazio)'}`);
  }

  function tirar(j, motivo) {
    if (jogadores.get(j.id) !== j) return;
    jogadores.delete(j.id);
    porBilhete.delete(j.bilhete);
    if (porConta.get(j.conta) === j) porConta.delete(j.conta);
    try { j.res?.end(); } catch { }
    paraTodos('saiu', { id: j.id, nome: j.nome, motivo });
    console.log(`[mundo] ${j.nome} saiu (${motivo}) — ${lista().length} online`);
    eleger();
  }

  const guarda = setInterval(() => {
    const agora = Date.now();
    for (const j of [...jogadores.values()]) {
      if (!j.conectado && agora - j.caiuEm > CARENCIA_MS) tirar(j, 'perdeu a conexão');
    }
    const sim = jogadores.get(simulador);
    if (sim && !sim.conectado) eleger();
    else if (sim && agora - sim.ultimoMundo > SEM_MUNDO_MS) {
      // o simulador está ligado mas calado (janela escondida, máquina travada):
      // só troca se houver para quem passar
      const outro = [...jogadores.values()].some((j) => j !== sim && j.conectado && j.lentoAte < agora);
      if (outro) { sim.lentoAte = agora + CASTIGO_MS; eleger(); }
    }
    if (estadoSujo) { estadoSujo = false; if (saves === 'disco') gravarJson(arqEstado, estado); }
  }, 500);
  guarda.unref?.();

  // ------------------------------------------------------------ recados

  function rotear(j, evento, carga) {
    if (typeof evento !== 'string' || evento.length > 32) return;
    const c = carga && typeof carga === 'object' ? carga : {};
    const souSim = j.id === simulador;
    switch (evento) {
      case 'pos': {
        const corte = regras.passo(j, carga);   // rápido demais: corta no lugar (`carga.x`/`z`)
        if (corte) avisarRegra(j, corte);
        return paraOutros(j.id, evento, carga);
      }
      case 'mundo':
        if (!souSim) return;
        j.ultimoMundo = Date.now();
        ultimoMundo = carga;
        if (c.est && typeof c.est === 'object' && JSON.stringify(c.est).length < 16 * 1024) { estado = c.est; estadoSujo = true; }
        return paraOutros(j.id, evento, carga);
      case 'golpe': {
        if (souSim || !simulador) return;
        const recusa = regras.golpe(j, c);   // acima do teto da arma: não chega
        if (recusa) return avisarRegra(j, recusa);
        return para(simulador, j.id, evento, carga);
      }
      case 'acao':
        if (!souSim && simulador) para(simulador, j.id, evento, carga);
        return;
      case 'dano':
        if (souSim && typeof c.para === 'string' && c.para !== j.id) para(c.para, j.id, evento, carga);
        return;
      case 'evento':
        if (souSim) return typeof c.para === 'string' ? para(c.para, j.id, evento, carga) : paraOutros(j.id, evento, carga);
        if (c.tipo === 'proj') paraOutros(j.id, evento, carga);   // a cópia visual do projétil de qualquer um
        return;
      case 'voz':
        if (typeof c.para === 'string' && c.para !== j.id && jogadores.has(c.para)) para(c.para, j.id, evento, carga);
        return;
      case 'chat': {
        const texto = typeof c.texto === 'string' ? c.texto.trim().slice(0, MAX_CHAT) : '';
        const agora = Date.now();
        if (!texto || agora - j.chatEm < CHAT_MS) return;
        j.chatEm = agora;
        for (const outro of jogadores.values()) escrever(outro, j.id, 'chat', { nome: j.nome, codigo: j.codigo, texto });
        return;
      }
      case 'visivel':
        j.visivel = !!c.v;
        if (j.visivel) j.lentoAte = 0;
        return eleger();
      case 'ping': return escrever(j, 'servidor', 'pong', { t: c.t, agora: Date.now() });
    }
  }

  function dentroDoRitmo(j, n) {
    const agora = Date.now();
    if (agora - j.ritmo.t > 1000) j.ritmo = { t: agora, n: 0 };
    j.ritmo.n += n;
    return j.ritmo.n <= RITMO_MAX;
  }

  // ------------------------------------------------------------ rotas

  async function entrar(req, res) {
    const corpo = await lerCorpo(req, 8 * 1024);
    if (!corpo || typeof corpo.token !== 'string') return erro(res, 400, 'pedido inválido');
    if (corpo.v !== VERSAO_MUNDO) return erro(res, 409, 'o jogo e o servidor estão em versões diferentes — atualize a página');
    if (mapa && corpo.mapa !== mapa) return erro(res, 409, `o servidor está no mapa "${mapa}", e este jogo em outro`);
    const quem = await conferirToken(corpo.token, { modoAuth, supabase });
    if (quem.erro) return erro(res, quem.status ?? 401, quem.erro);
    if (typeof corpo.personagem !== 'string' || !ID_PERSONAGEM.test(corpo.personagem)) return erro(res, 400, 'personagem inválido');
    const p = quem.teste
      ? conferirPerfilDeTeste(quem.id, corpo.personagem)
      : await conferirPersonagem(corpo.token, corpo.personagem, supabase);
    if (p.erro) return erro(res, p.status, p.erro);
    // Falhar em LER o save não pode virar "personagem novo": o primeiro save gravaria por cima do de verdade
    let salvo = null;
    if (saves === 'disco') {
      const lido = lerSave(arquivoDoPersonagem(p.id));
      if (lido.erro) return erro(res, 500, 'não consegui ler este personagem — tente de novo');
      salvo = lido.dados;
    }
    // a mesma conta entrou de novo (outra aba, outro computador, outro personagem): a sessão velha cai
    const antigo = porConta.get(quem.id);
    if (!antigo && jogadores.size >= MAX_JOGADORES) return erro(res, 503, 'o mundo está cheio');
    const mesmo = antigo?.id === p.id;
    if (antigo) {
      escrever(antigo, 'servidor', 'expulso', { motivo: 'esta conta entrou no mundo em outro lugar' });
      if (mesmo) {
        porBilhete.delete(antigo.bilhete);
        try { antigo.res?.end(); } catch { }
      } else tirar(antigo, 'trocou de personagem');
    }
    const j = {
      id: p.id, conta: quem.id, nome: p.nome, codigo: p.codigo, bilhete: crypto.randomBytes(24).toString('hex'), res: null,
      // quem já estava mantém o lugar na fila do simulador
      entrou: mesmo ? antigo.entrou : Date.now(), visivel: true, conectado: false, caiuEm: Date.now(),
      lentoAte: 0, ultimoMundo: Date.now(), ritmo: { t: 0, n: 0 }, chatEm: 0,
      // o NÍVEL, para o teto do golpe (regras-do-mundo.mjs): o do save daqui; na nuvem, o Supabase
      // diz logo depois (sem resposta, fica o teto do nível máximo); personagem sem save = nível 1
      nivel: saves === 'disco' ? salvo?.jogador?.nivel ?? 1 : null,
    };
    if (saves !== 'disco' && !quem.teste) lerNivel(corpo.token, j.id, supabase).then((n) => { if (n) j.nivel = n; });
    jogadores.set(j.id, j);
    porBilhete.set(j.bilhete, j);
    porConta.set(j.conta, j);
    json(res, 200, {
      ok: true, v: VERSAO_MUNDO, bilhete: j.bilhete, id: j.id, nome: j.nome, codigo: j.codigo, agora: Date.now(),
      // `saves: 'nuvem'`: o personagem não está aqui — o jogo o busca no Supabase
      saves, personagem: salvo, estado,
    });
  }

  // ------------------------------------------------------------ os perfis do modo de teste

  const gravarPerfisTeste = () => { if (saves === 'disco') gravarJson(arqPerfis, Object.fromEntries(perfisTeste)); };

  /** Este personagem é desta conta de teste? */
  function conferirPerfilDeTeste(conta, id) {
    const p = (perfisTeste.get(conta) ?? []).find((x) => x.id === id);
    return p ?? { erro: 'este personagem não é da sua conta', status: 403 };
  }

  function novoCodigoDeTeste() {
    const usados = new Set([...perfisTeste.values()].flat().map((p) => p.codigo));
    for (;;) {
      const c = Array.from(crypto.randomBytes(6), (b) => ALFABETO_CODIGO[b & 31]).join('');
      if (!usados.has(c)) return c;
    }
  }

  const nomeEmUso = (nome) => {
    const chave = chaveDoNome(nome);
    return [...perfisTeste.values()].flat().some((p) => chaveDoNome(p.nome) === chave);
  };

  /**
   * `POST /__mundo/perfis` — SÓ no modo de teste, onde não há Supabase para guardar a
   * lista. Faz o que os RPCs da migration 0006 fazem, com os mesmos nomes de erro. Com
   * conta de verdade esta rota não existe: o jogo fala com o Supabase (e por isso o
   * GitHub Pages não depende dela).
   */
  async function perfis(req, res) {
    const corpo = await lerCorpo(req, 8 * 1024);
    if (!corpo || typeof corpo.token !== 'string') return erro(res, 400, 'pedido inválido');
    const quem = await conferirToken(corpo.token, { modoAuth, supabase });
    if (quem.erro) return erro(res, quem.status ?? 401, quem.erro);
    if (!quem.teste) return erro(res, 404, 'rota desconhecida');
    const meus = perfisTeste.get(quem.id) ?? [];
    if (corpo.acao === 'listar') return json(res, 200, { ok: true, perfis: meus });
    if (corpo.acao === 'nome') {
      const nome = typeof corpo.nome === 'string' ? corpo.nome.trim().normalize('NFC') : '';
      return json(res, 200, { ok: true, livre: nomeValido(nome) && !nomeEmUso(nome) });
    }
    if (corpo.acao === 'criar') {
      const nome = typeof corpo.nome === 'string' ? corpo.nome.trim().normalize('NFC') : '';
      if (!nomeValido(nome)) return erro(res, 400, 'nome_invalido');
      if (corpo.aparencia != null && !(typeof corpo.aparencia === 'string' && /^[0-9][0-9a-f~.]{4,63}$/.test(corpo.aparencia))) return erro(res, 400, 'aparencia_invalida');
      if (meus.length >= MAX_PERSONAGENS) return erro(res, 409, 'limite_de_personagens');
      if (nomeEmUso(nome)) return erro(res, 409, 'nome_em_uso');
      const p = { id: crypto.randomUUID(), nome, codigo: novoCodigoDeTeste(), aparencia: corpo.aparencia ?? null, criado_em: new Date().toISOString() };
      perfisTeste.set(quem.id, [...meus, p]);
      gravarPerfisTeste();
      return json(res, 200, { ok: true, perfil: p });
    }
    if (corpo.acao === 'apagar') {
      const p = typeof corpo.id === 'string' && ID_PERSONAGEM.test(corpo.id) ? meus.find((x) => x.id === corpo.id) : null;
      if (!p) return erro(res, 404, 'personagem_nao_encontrado');
      if (typeof corpo.nome !== 'string' || chaveDoNome(corpo.nome.trim()) !== chaveDoNome(p.nome)) return erro(res, 400, 'confirmacao_errada');
      perfisTeste.set(quem.id, meus.filter((x) => x !== p));
      gravarPerfisTeste();
      if (saves === 'disco') fs.rm(arquivoDoPersonagem(p.id), { force: true }, () => {});
      return json(res, 200, { ok: true });
    }
    return erro(res, 400, 'pedido inválido');
  }

  function ouvir(req, res, j) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', ...CORS,
    });
    res.socket?.setNoDelay(true);
    try { j.res?.end(); } catch { }      // uma reconexão do mesmo bilhete troca o cano
    const voltou = j.conectado || j.jaOuviu;
    j.res = res; j.conectado = true; j.jaOuviu = true;
    res.write(': ok\n\n');
    escrever(j, 'servidor', 'ola', { eu: j.id, jogadores: lista(), simulador, mundo: ultimoMundo, estado, agora: Date.now() });
    if (!voltou) {
      paraOutros(j.id, 'entrou', { id: j.id, nome: j.nome, codigo: j.codigo });
      console.log(`[mundo] ${j.nome} entrou — ${lista().length} online`);
    }
    eleger();
    const batida = setInterval(() => res.write(': .\n\n'), 15000);
    req.on('close', () => {
      clearInterval(batida);
      if (j.res !== res) return;         // já foi trocado por uma reconexão
      j.res = null; j.conectado = false; j.caiuEm = Date.now();
      if (j.id === simulador) eleger();  // o mundo não espera a carência de quem o simulava
    });
  }

  async function falar(req, res, j) {
    const corpo = await lerCorpo(req, MAX_RECADO);
    if (!corpo) return erro(res, 400, 'recado inválido');
    const recados = Array.isArray(corpo.lote) ? corpo.lote.slice(0, 64) : [corpo];
    if (!dentroDoRitmo(j, recados.length)) { res.writeHead(429, CORS); return res.end(); }
    for (const r of recados) if (r && typeof r === 'object') rotear(j, r.evento, r.carga ?? null);
    res.writeHead(204, CORS); res.end();
  }

  async function personagem(req, res, j) {
    // sem disco, um save gravado aqui sumiria no próximo reinício — e sumir calado é o pior jeito
    if (saves !== 'disco') return erro(res, 409, 'neste servidor o personagem fica na conta (Supabase), não aqui');
    const arq = arquivoDoPersonagem(j.id);
    if (req.method === 'GET') {
      const lido = lerSave(arq);
      return lido.erro ? erro(res, 500, 'não consegui ler este personagem') : json(res, 200, { ok: true, personagem: lido.dados });
    }
    const d = await lerCorpo(req, MAX_SAVE);
    const motivo = d ? saveTorto(d) : 'save inválido ou grande demais';
    if (motivo) return erro(res, 400, motivo);
    d.salvoEm = new Date().toISOString();   // o relógio que vale é o daqui
    j.nivel = d.jogador.nivel;               // o teto do golpe acompanha (regras-do-mundo.mjs)
    gravarJson(arq, d, (e) => (e ? erro(res, 500, 'não consegui gravar') : json(res, 200, { ok: true, salvoEm: d.salvoEm })));
  }

  /** `id` já passou por `ID_PERSONAGEM`: só hexadecimal e hífens chegam ao caminho. */
  const arquivoDoPersonagem = (id) => path.join(pastaPersonagens, `${id}.json`);

  /**
   * As rotas de rede do chat de voz (`iceServers`, ver `turnDaVoz`) — só para quem
   * joga: um jogador do mundo (`b`, o bilhete) ou alguém com conta numa SALA
   * (`token`, conferido como no `entrar`: a sala não passa por este servidor).
   * `iceServers: null` = este servidor não tem retransmissor; a voz segue só com STUN.
   */
  async function ice(req, res) {
    const corpo = await lerCorpo(req, 8 * 1024);
    if (!corpo) return erro(res, 400, 'pedido inválido');
    const doMundo = typeof corpo.b === 'string' && BILHETE.test(corpo.b) && porBilhete.has(corpo.b);
    if (!doMundo) {
      if (typeof corpo.token !== 'string') return erro(res, 401, 'bilhete inválido — entre de novo');
      const quem = await conferirToken(corpo.token, { modoAuth, supabase });
      if (quem.erro) return erro(res, quem.status ?? 401, quem.erro);
    }
    json(res, 200, { ok: true, iceServers: await turnDaVoz() });
  }

  /** Atende `/__mundo/*`. Devolve false se a rota não é daqui. */
  function atender(req, res, urlPath) {
    if (!urlPath.startsWith('/__mundo/')) return false;
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return true; }
    const rota = urlPath.slice('/__mundo/'.length);

    if (rota === 'info') {
      json(res, 200, { quem: QUEM, v: VERSAO_MUNDO, jogadores: lista().length, max: MAX_JOGADORES, mapa, auth: modoAuth, saves });
      return true;
    }
    if (rota === 'entrar' && req.method === 'POST') { entrar(req, res).catch((e) => { console.warn('[mundo] entrar:', e); erro(res, 500, 'falha no servidor'); }); return true; }
    if (rota === 'perfis' && req.method === 'POST' && modoAuth === 'teste') { perfis(req, res).catch((e) => { console.warn('[mundo] perfis:', e); erro(res, 500, 'falha no servidor'); }); return true; }
    if (rota === 'ice' && req.method === 'POST') { ice(req, res).catch((e) => { console.warn('[mundo] ice:', e); erro(res, 500, 'falha no servidor'); }); return true; }

    // daqui para baixo, só com bilhete
    const b = new URL(req.url, 'http://x').searchParams.get('b') ?? '';
    const j = BILHETE.test(b) ? porBilhete.get(b) : null;
    if (!j) { erro(res, 401, 'bilhete inválido — entre de novo'); return true; }

    if (rota === 'ouvir' && req.method === 'GET') { ouvir(req, res, j); return true; }
    if (rota === 'falar' && req.method === 'POST') { falar(req, res, j); return true; }
    if (rota === 'personagem' && (req.method === 'GET' || req.method === 'POST')) { personagem(req, res, j); return true; }
    if (rota === 'sair' && req.method === 'POST') { res.writeHead(204, CORS); res.end(); tirar(j, 'saiu do mundo'); return true; }
    erro(res, 404, 'rota desconhecida');
    return true;
  }

  function fechar() {
    clearInterval(guarda);
    if (estadoSujo && saves === 'disco') { try { fs.mkdirSync(pasta, { recursive: true }); fs.writeFileSync(arqEstado, JSON.stringify(estado)); } catch { } }
    for (const j of jogadores.values()) { try { j.res?.end(); } catch { } }
  }

  console.log(`[mundo] pronto — mapa "${mapa ?? '?'}", até ${MAX_JOGADORES} jogadores, contas: ${modoAuth === 'teste' ? 'TESTE (qualquer nome entra!)' : 'Supabase'}, `
    + (saves === 'disco' ? `dados em ${pasta}` : 'SEM DISCO: personagens no Supabase, estado do mundo só na memória'));
  return { atender, fechar };
}

// ------------------------------------------------------------ contas

/**
 * De quem é este token? `{id, nome}` ou `{erro, status}`.
 * No modo de teste, `teste:<Nome>` vira a conta `teste-<nome>` (`teste: true`).
 */
async function conferirToken(token, { modoAuth, supabase }) {
  if (token.startsWith('teste:')) {
    if (modoAuth !== 'teste') return { erro: 'este servidor não aceita contas de teste', status: 401 };
    const nome = token.slice(6).trim();
    if (!/^[\p{L}\p{N} _-]{3,24}$/u.test(nome)) return { erro: 'nome de teste inválido (3 a 24 letras)', status: 400 };
    return { id: `teste-${nome.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'}`, nome, teste: true };
  }
  if (!supabase) return { erro: 'o servidor não achou os dados do Supabase (js/rede/supabase.js)', status: 500 };
  if (token.length > 4096) return { erro: 'sessão inválida', status: 401 };
  try {
    const cab = { apikey: supabase.chave, authorization: `Bearer ${token}` };
    const r = await fetch(`${supabase.url}/auth/v1/user`, { headers: cab, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return { erro: 'a sessão expirou — entre na conta de novo', status: 401 };
    const id = (await r.json())?.id;
    if (typeof id !== 'string' || !ID.test(id)) return { erro: 'sessão inválida', status: 401 };
    // o nome é o da Masmorra (`masmorra.jogadores`), lido com o token do próprio jogador
    let nome = 'Morto-vivo';
    try {
      const n = await fetch(`${supabase.url}/rest/v1/jogadores?select=nome&id=eq.${encodeURIComponent(id)}`,
        { headers: { ...cab, 'accept-profile': 'masmorra' }, signal: AbortSignal.timeout(8000) });
      const linhas = n.ok ? await n.json() : null;
      if (typeof linhas?.[0]?.nome === 'string') nome = linhas[0].nome.slice(0, 24);
    } catch { /* sem o nome o jogador entra do mesmo jeito */ }
    return { id, nome };
  } catch {
    return { erro: 'o servidor não conseguiu falar com o Supabase para conferir a conta', status: 502 };
  }
}

/**
 * Este personagem é da conta do token? Quem responde é a RLS do Supabase: com o token do
 * jogador, a linha de outra conta simplesmente não vem. `{id, nome, codigo}` ou `{erro, status}`.
 * Sem resposta do Supabase NÃO entra: quem não foi conferido não recebe bilhete.
 */
async function conferirPersonagem(token, id, supabase) {
  if (!supabase) return { erro: 'o servidor não achou os dados do Supabase (js/rede/supabase.js)', status: 500 };
  try {
    const r = await fetch(`${supabase.url}/rest/v1/personagens?select=id,nome,codigo&id=eq.${id}`, {
      headers: { apikey: supabase.chave, authorization: `Bearer ${token}`, 'accept-profile': 'masmorra' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { erro: 'o servidor não conseguiu conferir o seu personagem — tente de novo', status: 502 };
    const p = (await r.json())?.[0];
    if (p?.id !== id || typeof p.nome !== 'string' || typeof p.codigo !== 'string') return { erro: 'este personagem não é da sua conta', status: 403 };
    return { id: p.id, nome: p.nome, codigo: p.codigo };
  } catch {
    return { erro: 'o servidor não conseguiu falar com o Supabase para conferir o seu personagem', status: 502 };
  }
}

/**
 * O NÍVEL do personagem na nuvem (`dados.jogador.nivel`, com o token de quem entra: a RLS só deixa
 * ler o seu), para o teto do golpe. À parte do `conferirPersonagem` de propósito: falhar aqui nunca
 * impede ninguém de entrar — devolve null e o teto fica o do nível máximo. Personagem sem save = 1.
 */
async function lerNivel(token, id, supabase) {
  if (!supabase) return null;
  try {
    const r = await fetch(`${supabase.url}/rest/v1/personagens?select=nivel:dados->jogador->nivel&id=eq.${id}`, {
      headers: { apikey: supabase.chave, authorization: `Bearer ${token}`, 'accept-profile': 'masmorra' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const p = (await r.json())?.[0];
    if (!p) return null;
    return Number.isInteger(p.nivel) && p.nivel >= 1 && p.nivel <= 999 ? p.nivel : p.nivel == null ? 1 : null;
  } catch {
    return null;
  }
}

// ------------------------------------------------------------ o nome do personagem

/**
 * A forma do nome que decide se dois nomes são o mesmo: "João" e "joao" dão "joao".
 * A MESMA conta de `masmorra.chave_do_nome()` (migration 0006) e de `js/rede/perfis.js`.
 */
export const chaveDoNome = (nome) => nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** De 3 a 16 letras e números, sem espaços (`masmorra.nome_valido()`). */
export function nomeValido(nome) {
  if (typeof nome !== 'string' || nome !== nome.normalize('NFC')) return false;
  const n = [...nome].length;
  return n >= 3 && n <= 16 && !/[\u0300-\u036f]/.test(nome) && /^[a-z0-9]{3,16}$/.test(chaveDoNome(nome));
}

// ------------------------------------------------------------ o retransmissor da voz

/** Validade das credenciais pedidas à Cloudflare; o servidor as reaproveita até a metade disso. */
const TURN_VALIDADE_S = 24 * 3600;
let turn = null, pedindoTurn = null, turnFalhouAte = 0;

/**
 * O RETRANSMISSOR (TURN) do chat de voz (08/10/2026): a lista `iceServers` para o
 * `RTCPeerConnection`, ou null sem ele. Só com STUN, celular no 4G não fechava a
 * conexão com ninguém ("não conectou"): a operadora não deixa entrar ligação
 * direta. Com o TURN, o áudio dá a volta pela Cloudflare (1000 GB/mês grátis; voz
 * a 32 kbps é ~15 MB por hora por pessoa).
 *
 * A chave é SEGREDO e fica aqui (variáveis `TURN_CF_ID` e `TURN_CF_TOKEN`, no
 * painel do Render): o jogo recebe só credenciais que vencem em `TURN_VALIDADE_S`.
 * `TURN_CF_API` troca o endereço da Cloudflare (o teste usa um falso).
 */
async function turnDaVoz() {
  const id = process.env.TURN_CF_ID, token = process.env.TURN_CF_TOKEN;
  if (!id || !token) return null;
  if (turn && Date.now() < turn.ate) return turn.iceServers;
  if (Date.now() < turnFalhouAte) return null;   // a Cloudflare recusou há pouco: não insiste a cada pedido
  pedindoTurn ??= (async () => {
    try {
      const api = (process.env.TURN_CF_API || 'https://rtc.live.cloudflare.com').replace(/\/+$/, '');
      const r = await fetch(`${api}/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: TURN_VALIDADE_S }),
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`a Cloudflare respondeu ${r.status}`);
      const lista = limparIce((await r.json())?.iceServers);
      if (!lista.length) throw new Error('a Cloudflare respondeu sem iceServers');
      turn = { iceServers: lista, ate: Date.now() + TURN_VALIDADE_S * 500 };
      return lista;
    } catch (e) {
      console.warn(`[mundo] TURN: ${e?.message ?? e}`);
      turnFalhouAte = Date.now() + 60_000;
      return null;
    } finally {
      pedindoTurn = null;
    }
  })();
  return pedindoTurn;
}

/**
 * Os `iceServers` como o navegador os quer — sem a porta 53, que o navegador
 * bloqueia (o candidato fica esperando até vencer, segundo a Cloudflare).
 */
export function limparIce(lista) {
  const saida = [];
  for (const s of [].concat(lista ?? [])) {
    if (!s || typeof s !== 'object') continue;
    const urls = [].concat(s.urls ?? []).filter((u) => typeof u === 'string' && /^(stun|turns?):/.test(u) && !/:53(\?|$)/.test(u));
    if (!urls.length) continue;
    const o = { urls };
    if (typeof s.username === 'string') o.username = s.username;
    if (typeof s.credential === 'string') o.credential = s.credential;
    saida.push(o);
  }
  return saida;
}

/** A URL e a chave publicável do Supabase: as MESMAS do cliente, lidas do arquivo dele. */
function lerSupabase(raiz) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) return { url: process.env.SUPABASE_URL, chave: process.env.SUPABASE_KEY };
  try {
    const fonte = fs.readFileSync(path.join(raiz, 'js', 'rede', 'supabase.js'), 'utf8');
    const url = fonte.match(/export const SUPABASE_URL = '([^']+)'/)?.[1];
    const chave = fonte.match(/export const SUPABASE_KEY = '([^']+)'/)?.[1];
    return url && chave ? { url, chave } : null;
  } catch { return null; }
}

/** O nome do mapa ativo (`assets/mapa.json`): quem entra tem de estar no mesmo. */
function lerNomeDoMapa(raiz) {
  const d = lerJson(path.join(raiz, 'assets', 'mapa.json'));
  return typeof d?.ativo === 'string' && d.mapas?.[d.ativo] ? d.ativo : null;
}

// ------------------------------------------------------------ o save

/**
 * O que há de errado com este save? `null` = nada. Confere a FORMA e os
 * LIMITES — é o que impede um arquivo torto de travar o jogo de quem o abre
 * depois, e um nível 9999 escrito à mão de passar sem ninguém notar.
 * As MESMAS contas de `masmorra.personagem_valido()` (migration 0005): mudou aqui, mude lá.
 */
export function saveTorto(d) {
  const inteiro = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  const objeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const idDeHabilidade = (v) => typeof v === 'string' && /^[a-z][a-z0-9_.-]{0,59}$/.test(v);
  if (!objeto(d)) return 'save inválido';
  if (d.versao !== 1) return 'versão de save desconhecida';
  const j = d.jogador, inv = d.inventario, m = d.mundo;
  if (!objeto(j) || !objeto(inv) || !objeto(m)) return 'save incompleto';
  if (!inteiro(j.nivel, 1, 999)) return 'nível fora do limite';
  // os três atributos não valem mais nada no jogo (ficha.js `atributosDeCompatibilidade`):
  // a soma deixou de ser exigida, só o limite continua
  for (const k of ['vigor', 'endurance', 'strength']) if (!inteiro(j[k], 1, 999)) return `atributo "${k}" fora do limite`;
  if (!inteiro(j.almas, 0, 1e9)) return 'almas fora do limite';
  // a árvore de habilidades: save sem o campo vale como árvore vazia
  const h = j.habilidades;
  if (h !== undefined) {
    if (!objeto(h) || h.v !== 1 || !objeto(h.nos)) return 'habilidades inválidas';
    if (!Array.isArray(h.barra) || h.barra.length !== 4) return 'barra de habilidades inválida';
    if (!h.barra.every((id) => id === null || idDeHabilidade(id))) return 'barra de habilidades inválida';
    let gastos = 0;
    for (const [id, pontos] of Object.entries(h.nos)) {
      if (!idDeHabilidade(id) || !inteiro(pontos, 1, 999)) return 'habilidade inválida';
      gastos += pontos;
    }
    if (gastos > j.nivel - 1) return 'pontos de habilidade demais para o nível';
  }
  if (!Array.isArray(inv.itens) || inv.itens.length > 200) return 'inventário inválido';
  for (const it of inv.itens) {
    // (o tamanho em caracteres de verdade, como o `length` do SQL: um emoji conta 1)
    if (!Array.isArray(it) || typeof it[0] !== 'string' || [...it[0]].length > 40 || !inteiro(it[1], 0, 999)) return 'item inválido no inventário';
  }
  return null;
}

// ------------------------------------------------------------ arquivos

function lerJson(arq) {
  try { return JSON.parse(fs.readFileSync(arq, 'utf8')); } catch { return null; }
}

/**
 * Lê o save de um personagem separando "ainda não tem" (`{dados: null}`) de "não consegui
 * ler" (`{erro: true}`): só o primeiro pode começar um personagem do zero.
 */
function lerSave(arq) {
  let txt;
  try { txt = fs.readFileSync(arq, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? { dados: null } : { erro: true }; }
  try { return { dados: JSON.parse(txt) }; } catch { return { erro: true }; }
}

/** Grava num temporário e renomeia: um desligamento no meio não corrompe o arquivo. */
function gravarJson(arq, dados, fim = () => {}) {
  fs.mkdir(path.dirname(arq), { recursive: true }, (e0) => {
    if (e0) return fim(e0);
    const tmp = `${arq}.${process.pid}.tmp`;
    fs.writeFile(tmp, JSON.stringify(dados), (e1) => {
      if (e1) return fim(e1);
      fs.rename(tmp, arq, fim);
    });
  });
}
