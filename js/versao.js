// RECARREGAR PARA TODOS (02/10/2026) — o jogo vigia a própria versão.
//
// O jogo é publicado com `git push` (GitHub Pages), mas quem está com a página
// aberta segue no código antigo até recarregar. Para a atualização chegar a
// todos, cada página lê `assets/versao.json` ao abrir e de novo a cada minuto:
// quando o `versao` de lá muda, ela AVISA, grava o progresso e recarrega.
//
// **Quem decide é quem publica**: recarrega-se a todos MUDANDO o `versao` do
// arquivo no mesmo push. Um push que não mexe nele (documentação, um ajuste
// que pode esperar) não incomoda ninguém.
//
// O que erra CALADO aqui:
//   • **o cache do navegador.** O Pages manda guardar cada arquivo por 10 min,
//     e um recarregar comum reusa os módulos guardados — a página voltaria no
//     código VELHO achando que atualizou. Por isso, antes de recarregar, cada
//     arquivo que a página carregou é buscado de novo com `cache: 'reload'`,
//     que vai à rede e troca a cópia guardada.
//   • **o laço.** A versão de partida é a do ARQUIVO lido ao abrir, não um
//     número escrito no código: depois de recarregar a partida já é a nova, e
//     não há como a página se recarregar para sempre.
//   • **o arquivo no cache.** Ele é lido com `no-store` e um `?t=` diferente a
//     cada vez; sem isso a página leria por 10 min a versão que já conhece.

const ARQUIVO = 'assets/versao.json';
const INTERVALO_MS = 60_000;
/** Jogando, dá este tempo para sair do meio de um golpe antes de recarregar. */
const AVISO_S = 12;
const CHAVE_AVISO = 'masmorra:atualizado';

async function ler() {
  try {
    const r = await fetch(`${ARQUIVO}?t=${Date.now()}`, { cache: 'no-store' });
    const d = r.ok ? await r.json() : null;
    return typeof d?.versao === 'string' && d.versao ? { versao: d.versao, nota: typeof d.nota === 'string' ? d.nota.slice(0, 120) : '' } : null;
  } catch { return null; }
}

/** O que a última atualização trouxe, para a tela de título dizer (e some depois de dito). */
export function notaDaAtualizacao() {
  try {
    const nota = sessionStorage.getItem(CHAVE_AVISO);
    sessionStorage.removeItem(CHAVE_AVISO);
    return nota;
  } catch { return null; }
}

/** Liga a vigia. Sem o arquivo (uma cópia antiga do jogo), não faz nada. */
export async function vigiarVersao(game) {
  const partida = await ler();
  if (!partida) return;
  game.versao = partida.versao;
  let atualizando = false;
  const olhar = async () => {
    if (atualizando || document.hidden) return;
    const agora = await ler();
    if (!agora || agora.versao === partida.versao || atualizando) return;
    atualizando = true;
    atualizar(game, agora);
  };
  game.olharVersao = olhar;   // para o console e para os testes
  setInterval(olhar, INTERVALO_MS);
  // quem volta para a aba depois de um tempo confere na hora
  document.addEventListener('visibilitychange', () => { if (!document.hidden) olhar(); });
}

async function atualizar(game, nova) {
  const jogando = game.state === 'playing';
  if (jogando) {
    game.ui.centerMessage('NOVA VERSÃO DO JOGO', 'info', 5000);
    game.ui.toast(`O jogo foi atualizado${nova.nota ? `: ${nova.nota}` : ''}. Recarregando em ${AVISO_S} s…`);
  }
  // Traz os arquivos novos para o cache ANTES de recarregar (ver o cabeçalho).
  // Só código, estilo e dados: os modelos (.glb) pesam 25 MB e quase nunca mudam.
  const urls = new Set([location.href.split('#')[0]]);
  for (const r of performance.getEntriesByType('resource')) {
    if (r.name.startsWith(location.origin) && /\.(js|css|json|html)(\?|$)/.test(r.name)) urls.add(r.name.split('?')[0]);
  }
  await Promise.all([
    ...[...urls].map((u) => fetch(u, { cache: 'reload' }).catch(() => {})),
    new Promise((ok) => setTimeout(ok, jogando ? AVISO_S * 1000 : 0)),
  ]);
  // grava o que foi feito até o último segundo; depois, sai do mundo e recarrega
  try { await game.salvar({ nuvem: true }); } catch { }
  try { sessionStorage.setItem(CHAVE_AVISO, nova.nota || `versão ${nova.versao}`); } catch { }
  try { game.sessao?.sair?.(); } catch { }
  location.reload();
}
