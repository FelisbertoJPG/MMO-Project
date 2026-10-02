// CÓPIA GERADA de js/modelomalha.js do editor de cenas (ferramentas/levar-modelo.mjs).
// NÃO EDITE AQUI: mude lá e rode a ferramenta de novo — duas montagens divergiriam.
import * as THREE from 'three';

/**
 * De um MODELO DE BLOCOS (`modelo.js`) para um `THREE.Group` — a mesma conta
 * no Editor de modelo e no JOGO.
 *
 * O jogo não importa este arquivo daqui: `ferramentas/levar-modelo.mjs` o
 * COPIA para lá (trocando só a linha do `import` do three, que lá vem do
 * import map), e `modelo.test.mjs` cobra que a cópia continue igual. Duas
 * montagens escritas à parte divergiriam, e o dragão sairia diferente no jogo
 * do que foi montado no editor — sem erro nenhum.
 *
 * Sem DOM: roda em Node, e é o que o teste usa.
 *
 * ## O que erra CALADO aqui
 *
 * - **face entre dois blocos da mesma peça não é desenhada.** Ela não aparece
 *   de nenhum ângulo, e desenhá-la multiplica os triângulos por até 6 — um
 *   dragão de 3 mil blocos viraria 36 mil triângulos, quase todos escondidos.
 * - **a cor vai no VÉRTICE** (`vertexColors`): sem o atributo `color`, a peça
 *   sai branca; sem `normal`, preta. O teste mede os dois.
 * - **a peça filha é montada DENTRO do grupo do pai**, e por isso a ordem das
 *   peças no arquivo não importa: primeiro todas são criadas, depois
 *   penduradas. Pendurar na ordem do arquivo perderia a filha que vem antes do
 *   pai — ela ficaria na raiz, fora do lugar, sem aviso.
 * - **o grupo da peça tem ORDEM FIXA**: o primeiro filho é a malha dos blocos,
 *   o segundo é o grupo das primitivas, e só depois vêm as peças penduradas.
 *   O jogo e o editor acham a malha por `children[0]`.
 */

// A grade fina de `modelo.js` (4 casas por bloco base; o menor bloco é ¼).
// Repetida aqui de propósito: este arquivo vai COPIADO para o jogo, e lá não
// há `modelo.js` — importar dele quebraria a cópia.
const FINO = 4;

// as 6 faces de um cubo unitário: o eixo dela, a normal e os 4 cantos (em
// volta, anti-horário visto de fora)
const FACES = [
  { eixo: 0, n: [1, 0, 0], c: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { eixo: 0, n: [-1, 0, 0], c: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
  { eixo: 1, n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { eixo: 1, n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { eixo: 2, n: [0, 0, 1], c: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
  { eixo: 2, n: [0, 0, -1], c: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
];
const OUTROS = [[1, 2], [0, 2], [0, 1]];

/** Uma casa da grade fina como número (cabe folgado: o limite é ±64 blocos = ±256 casas). */
const casa = (x, y, z) => ((x + 1024) * 2048 + (y + 1024)) * 2048 + (z + 1024);

// ------------------------------------------------------------------ formas
// Cada forma é desenhada na caixa unitária [0,1]³, com normais PLANAS (uma
// por triângulo): é o estilo dos blocos, e as normais suaves do three fariam
// a esfera de 12 lados parecer uma bola lisa mal iluminada.

/** Os triângulos crus (x,y,z × 3 por triângulo) de uma forma, sem giro. */
function triangulosDaForma(forma) {
  const juntar = (...gs) => gs.flatMap((g) => [...g.toNonIndexed().getAttribute('position').array]);
  const A = [0, 0, 0], B = [1, 0, 0], C = [1, 0, 1], D = [0, 0, 1];
  switch (forma) {
    case 'cunha': {        // rampa: alta atrás (z = 0), desce até a frente (z = 1)
      const E = [0, 1, 0], F = [1, 1, 0];
      return [A, B, C, A, C, D, A, E, F, A, F, B, E, D, C, E, C, F, A, D, E, B, F, C].flat();
    }
    case 'piramide': {
      const P = [0.5, 1, 0.5];
      return [A, B, C, A, C, D, D, C, P, C, B, P, B, A, P, A, D, P].flat();
    }
    case 'esfera': return juntar(new THREE.SphereGeometry(0.5, 12, 8).translate(0.5, 0.5, 0.5));
    case 'cilindro': return juntar(new THREE.CylinderGeometry(0.5, 0.5, 1, 12).translate(0.5, 0.5, 0.5));
    case 'cone': return juntar(new THREE.ConeGeometry(0.5, 1, 12).translate(0.5, 0.5, 0.5));
    case 'cupula': return juntar(   // meia esfera esticada até o teto da caixa, com o fundo tampado
      new THREE.SphereGeometry(0.5, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0.5, 0, 0.5),
      new THREE.CircleGeometry(0.5, 12).rotateX(Math.PI / 2).translate(0.5, 0, 0.5));
    default: return null;
  }
}

const MOLDES = new Map();
/**
 * Uma forma girada, na caixa [0,1]³: `{ pos, nor }` (não indexada). O giro é
 * em quartos de volta, em volta do CENTRO da caixa — girar não a tira de lá.
 * Triângulo degenerado (os polos da esfera) sai: a normal dele seria zero.
 */
export function moldeDaForma(forma, giro = [0, 0, 0]) {
  const chave = `${forma}:${giro.join(',')}`;
  if (MOLDES.has(chave)) return MOLDES.get(chave);
  const cru = triangulosDaForma(forma);
  if (!cru) return null;
  const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...giro.map((q) => (q * Math.PI) / 2), 'XYZ'));
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const redondo = (x) => Math.round(x * 1e6) / 1e6;
  const pos = [], nor = [];
  for (let t = 0; t < cru.length; t += 9) {
    for (let q = 0; q < 3; q++) {
      v[q].set(cru[t + q * 3] - 0.5, cru[t + q * 3 + 1] - 0.5, cru[t + q * 3 + 2] - 0.5).applyMatrix4(m).addScalar(0.5);
      // o quarto de volta dá 0,9999999: arredondar mantém a caixa exata
      v[q].set(redondo(v[q].x), redondo(v[q].y), redondo(v[q].z));
    }
    const n = e1.subVectors(v[1], v[0]).cross(e2.subVectors(v[2], v[0]));
    if (n.lengthSq() < 1e-12) continue;
    n.normalize();
    for (const p of v) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); }
  }
  const molde = { pos, nor };
  MOLDES.set(chave, molde);
  return molde;
}

/** A forma como geometria solta, na caixa [0,1]³ (é o fantasma do editor). */
export function geoDaForma(forma, giro = [0, 0, 0]) {
  const m = forma === 'cubo' ? null : moldeDaForma(forma, giro);
  if (!m) return new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(m.nor, 3));
  return g;
}

// ------------------------------------------------------------- primitivas
// As peças das ARMADURAS do jogo: as mesmas geometrias do three que o
// `gear.js` sempre usou, com os mesmos parâmetros — e o trapo e a capa com a
// MESMA deformação de lá (a barra rasgada, o caimento), número por número. Um
// saiote "parecido" mudaria a silhueta de todo esqueleto do jogo.

/** A geometria de uma primitiva (`modelo.js` → `PRIMITIVAS`), ou `null` (a âncora). */
export function geoDaPrimitiva(pr) {
  const p = pr.p;
  switch (pr.tipo) {
    case 'caixa': return new THREE.BoxGeometry(p.width, p.height, p.depth, p.widthSegments, p.heightSegments, p.depthSegments);
    case 'cilindro': return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments, p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    case 'esfera': return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength);
    case 'cone': return new THREE.ConeGeometry(p.radius, p.height, p.radialSegments, p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
    case 'toro': return new THREE.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments, p.arc);
    case 'plano': return new THREE.PlaneGeometry(p.width, p.height, p.widthSegments, p.heightSegments);
    case 'trapo': {        // o `rag()` do gear.js: saiote aberto com a barra rasgada
      const g = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 16, 3, true);
      const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) if (a.getY(i) < -p.height / 2 + 0.01) a.setY(i, a.getY(i) + ((i * 7919) % 13) / 13 * p.height * 0.35);
      g.computeVertexNormals();
      return g;
    }
    case 'capa': {         // a capa do cavaleiro: a barra irregular e a curva para trás
      const g = new THREE.PlaneGeometry(p.width, p.height, 4, 6);
      const a = g.attributes.position;
      for (let i = 0; i < a.count; i++) {
        if (a.getY(i) < -0.4) a.setY(i, a.getY(i) + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.12);
        a.setZ(i, -Math.pow((a.getY(i) - 0.5) / 1, 2) * 0.12);
      }
      g.computeVertexNormals();
      return g;
    }
    default: return null;
  }
}

/**
 * Os materiais do JOGO (`Gear.mats` do `gear.js`), como o editor os mostra.
 * O jogo passa os DELE a `montarModelo` (`materialDe`), com textura e reflexo;
 * esta tabela é a vista do editor e a lista de nomes que o painel oferece. O
 * metal sai mais fosco que no jogo: sem o mapa de ambiente de lá, metal de
 * verdade fica preto.
 */
export const MATERIAIS = {
  steel: { cor: 0x77787c, metal: 0.65, aspero: 0.45 },
  darkSteel: { cor: 0x4c4d53, metal: 0.6, aspero: 0.52 },
  blade: { cor: 0x9a9ca2, metal: 0.95, aspero: 0.28 },
  rusty: { cor: 0x6a4a36, metal: 0.6, aspero: 0.8 },
  gold: { cor: 0x7a5e2a, metal: 0.9, aspero: 0.45 },
  leather: { cor: 0x3a2618, metal: 0, aspero: 0.85 },
  darkLeather: { cor: 0x1e1510, metal: 0, aspero: 0.9 },
  wood: { cor: 0x4a3322, metal: 0, aspero: 0.9 },
  tabard: { cor: 0x3d1512, metal: 0, aspero: 1, dupla: true },
  cape: { cor: 0x3b2c22, metal: 0, aspero: 1, dupla: true },
  rag: { cor: 0x3a342a, metal: 0, aspero: 1, dupla: true },
  robe: { cor: 0x1c1826, metal: 0, aspero: 1, dupla: true },
  hood: { cor: 0x0c0a0a, metal: 0, aspero: 1, dupla: true },
  bone: { cor: 0xbdb49c, metal: 0, aspero: 0.8 },
  under: { cor: 0x2b2622, metal: 0.3, aspero: 0.85 },
  skin: { cor: 0x6b5a4e, metal: 0, aspero: 0.75 },
  torchHead: { cor: 0x2a1a10, metal: 0, aspero: 1, brilho: 0x401000 },
  orb: { cor: 0x40107a, metal: 0, aspero: 1, brilho: 0x8a3aff },
  socket: { cor: 0x050303, basico: true },
  olho: { cor: 0xffa040, basico: true },     // os olhos acesos do esqueleto (o jogo apaga os dos cadáveres)
};

const MATS_DO_EDITOR = new Map();
/** O material de uma primitiva no EDITOR: da tabela acima, com a `cor` trocada se houver. */
export function materialDoEditor(nome, cor = null) {
  const chave = `${nome}:${cor ?? ''}`;
  if (MATS_DO_EDITOR.has(chave)) return MATS_DO_EDITOR.get(chave);
  const d = MATERIAIS[nome] ?? MATERIAIS.steel;
  const m = d.basico
    ? new THREE.MeshBasicMaterial({ color: cor ?? d.cor })
    : new THREE.MeshStandardMaterial({
      color: cor ?? d.cor, metalness: d.metal * 0.5, roughness: d.aspero,
      emissive: d.brilho ?? 0x000000, side: d.dupla ? THREE.DoubleSide : THREE.FrontSide,
    });
  MATS_DO_EDITOR.set(chave, m);
  return m;
}

/** O objeto de uma primitiva: a malha dela, ou um ponto vazio (a âncora). */
export function objetoDaPrimitiva(pr, materialDe = materialDoEditor) {
  const geo = geoDaPrimitiva(pr);
  const o = geo ? new THREE.Mesh(geo, materialDe(pr.mat, pr.cor)) : new THREE.Object3D();
  if (geo) { o.castShadow = true; o.receiveShadow = true; }
  o.name = pr.tipo === 'ancora' ? pr.nome : pr.tipo;
  o.position.fromArray(pr.pos);
  o.rotation.set(pr.giro[0], pr.giro[1], pr.giro[2]);
  o.scale.fromArray(pr.escala);
  return o;
}

/**
 * A geometria de UMA peça, com cor e normal por vértice.
 *
 * O CUBO só desenha o que está exposto — e com tamanhos misturados a face é
 * conferida casa a casa da grade fina: toda coberta, some; toda livre, sai num
 * quadrado só; coberta em parte (um bloco de ½ em cima de um de 1), sai um
 * quadradinho por casa livre. As outras formas saem inteiras e NÃO tapam o
 * vizinho: a esfera não enche a caixa, e a face do cubo encostado nela
 * apareceria vazada pelos cantos.
 *
 * Aceita o bloco curto (`[i, j, k, cor]`): o jogo passa o arquivo direto.
 */
export function geoDaPeca(peca, bloco) {
  const bls = peca.blocos.map(([i, j, k, cor, tam = 1, forma = 'cubo', giro = [0, 0, 0]]) => ({
    o: [Math.round(i * FINO), Math.round(j * FINO), Math.round(k * FINO)], n: Math.round(tam * FINO), cor, forma, giro,
  }));
  const cheio = new Set();
  for (const b of bls) {
    if (b.forma !== 'cubo') continue;
    for (let x = 0; x < b.n; x++) for (let y = 0; y < b.n; y++) for (let z = 0; z < b.n; z++) cheio.add(casa(b.o[0] + x, b.o[1] + y, b.o[2] + z));
  }
  const u = bloco / FINO;
  const pos = [], nor = [], cor = [], idx = [];
  const c = new THREE.Color();
  const quadrado = (f, base, ext) => {
    const b0 = pos.length / 3;
    for (const q of f.c) {
      pos.push((base[0] + q[0] * ext[0]) * u, (base[1] + q[1] * ext[1]) * u, (base[2] + q[2] * ext[2]) * u);
      nor.push(...f.n);
      cor.push(c.r, c.g, c.b);
    }
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
  };
  const p = [0, 0, 0];
  for (const b of bls) {
    c.set(b.cor);
    if (b.forma !== 'cubo') {
      const m = moldeDaForma(b.forma, b.giro);
      if (!m) continue;
      const b0 = pos.length / 3;
      for (let v = 0; v < m.pos.length; v += 3) {
        pos.push((b.o[0] + m.pos[v] * b.n) * u, (b.o[1] + m.pos[v + 1] * b.n) * u, (b.o[2] + m.pos[v + 2] * b.n) * u);
        nor.push(m.nor[v], m.nor[v + 1], m.nor[v + 2]);
        cor.push(c.r, c.g, c.b);
      }
      for (let v = 0; v < m.pos.length / 3; v++) idx.push(b0 + v);
      continue;
    }
    for (const f of FACES) {
      const a = f.eixo, [e1, e2] = OUTROS[a];
      p[a] = f.n[a] > 0 ? b.o[a] + b.n : b.o[a] - 1;     // a camada de casas logo do lado de fora da face
      const livres = [];
      for (let s = 0; s < b.n; s++) {
        for (let t = 0; t < b.n; t++) {
          p[e1] = b.o[e1] + s; p[e2] = b.o[e2] + t;
          if (!cheio.has(casa(p[0], p[1], p[2]))) livres.push(s, t);
        }
      }
      if (!livres.length) continue;                                    // vizinhos cobrem a face
      if (livres.length === 2 * b.n * b.n) { quadrado(f, b.o, [b.n, b.n, b.n]); continue; }
      for (let q = 0; q < livres.length; q += 2) {
        const base = [...b.o], ext = [1, 1, 1];
        base[e1] += livres[q]; base[e2] += livres[q + 1]; ext[a] = b.n;
        quadrado(f, base, ext);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/** Posição, giro (XYZ, radianos) e escala da peça no grupo dela. */
export function aplicarPeca(grupo, peca) {
  grupo.position.fromArray(peca.pos);
  grupo.rotation.set(peca.giro[0], peca.giro[1], peca.giro[2]);
  grupo.scale.fromArray(peca.escala);
}

/**
 * Monta o modelo. Devolve `{ raiz, pecas, ancoras }`: `pecas` é id →
 * `THREE.Group` da peça (é por ele que o jogo anima — gira o grupo `asaE`
 * para bater a asa); `ancoras` é nome → o ponto de cada âncora. O grupo da
 * peça tem a malha dos blocos, o grupo das primitivas e, depois, as peças
 * penduradas nela (ver o cabeçalho).
 *
 * `material` (dos blocos) e `materialDe(nome, cor)` (das primitivas) são
 * opcionais: o jogo passa os DELE (para piscar ao levar golpe, e os metais
 * com textura do `gear.js`).
 */
export function montarModelo(modelo, { material = null, materialDe = materialDoEditor } = {}) {
  const mat = material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.05 });
  const raiz = new THREE.Group();
  raiz.name = modelo.nome ?? 'modelo';
  const pecas = new Map();
  const ancoras = new Map();
  for (const p of modelo.pecas) {
    const g = new THREE.Group();
    g.name = p.id;
    aplicarPeca(g, p);
    const malha = new THREE.Mesh(geoDaPeca(p, modelo.bloco), mat);
    malha.name = `${p.id}:malha`;
    malha.castShadow = true;
    malha.receiveShadow = true;
    g.add(malha);
    const prims = new THREE.Group();
    prims.name = `${p.id}:primitivas`;
    (p.primitivas ?? []).forEach((pr, n) => {
      const o = objetoDaPrimitiva(pr, materialDe);
      o.userData = { peca: p.id, primitiva: n };
      prims.add(o);
      if (pr.tipo === 'ancora') ancoras.set(pr.nome, o);
    });
    g.add(prims);
    g.userData.peca = p.id;
    pecas.set(p.id, g);
  }
  // pendurar DEPOIS de criar todas (ver o cabeçalho)
  for (const p of modelo.pecas) (pecas.get(p.pai) ?? raiz).add(pecas.get(p.id));
  return { raiz, pecas, ancoras, material: mat };
}

/**
 * Devolve à GPU o que `montarModelo` criou (as geometrias são só deste
 * modelo). Os materiais das primitivas NÃO: são da tabela (`materialDoEditor`)
 * ou do jogo, e outros modelos os usam.
 */
export function descartarModelo({ raiz, material }, { comMaterial = true } = {}) {
  raiz.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  if (comMaterial) material?.dispose();
}
