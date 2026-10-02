// ONDE ESTE JOGO ESTÁ RODANDO (02/10/2026) — e o que isso muda.
//
// O jogo abre de dois jeitos:
//
//   • pelo `server.js` (o `masmorra.exe`, `npm start`): há um servidor NOSSO por
//     trás da página. O save da Jornada é um arquivo (`/__save`), as salas da
//     rede local existem (`/__lan/*`), e o mundo online pode estar ali mesmo.
//   • por um host só de ARQUIVOS (o GitHub Pages): não há servidor nenhum. O
//     save da Jornada fica no navegador (`localStorage`) — e na conta, se
//     houver —, não há sala de rede local, e o mundo online mora em OUTRO
//     endereço: o `MUNDO_PADRAO` abaixo.
//
// Quem decide é a sonda `/__saude` (a mesma do launcher), uma vez, no
// carregamento. Um `server.js` subido com `HOSPEDAR=1` (na internet, atrás de
// túnel) responde `hospedando: true`: para o SAVE ele vale como host de
// arquivos — lá o `/__save` não atende ninguém —, mas o mundo é ele mesmo.

/**
 * O endereço do servidor de mundo (`servidor-mundo.mjs`) quando a página NÃO é
 * servida por ele — isto é, no GitHub Pages. Vazio = ainda não há servidor: o
 * bloco "Mundo online" da tela inicial avisa e fica desligado.
 * Tem de ser `https://…`: uma página `https` não fala com servidor `http`.
 * Hoje: o serviço `masmorra-do-carrasco-mundo` do Render (`render.yaml`).
 */
export const MUNDO_PADRAO = 'https://masmorra-do-carrasco-mundo.onrender.com';

/** 'servidor' | 'hospedado' (server.js com HOSPEDAR=1) | 'arquivos'. Antes de `detectar()`, 'servidor'. */
let onde = 'servidor';

/** Pergunta à origem da página quem a serve. Chamada uma vez, no carregamento. */
export async function detectarHospedagem() {
  try {
    const r = await fetch('/__saude', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
    const d = r.ok ? await r.json() : null;
    onde = d?.quem === 'masmorra-do-carrasco' ? (d.hospedando ? 'hospedado' : 'servidor') : 'arquivos';
  } catch { onde = 'arquivos'; }
  return onde;
}

/** Há o `/__save` (o save em arquivo, do `server.js` de quem joga)? Sem ele, o save é do navegador. */
export const temSaveEmArquivo = () => onde === 'servidor';
/** Há as rotas `/__lan/*` (as salas na rede local)? */
export const temRedeLocal = () => onde === 'servidor';
/** A própria origem da página serve o mundo online (`/__mundo/*`)? */
export const serveOMundo = () => onde !== 'arquivos';
