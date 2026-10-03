// Converte o FBX do "Low Poly Axe Warrior" (loja da Unity) para assets/guerreiro/guerreiro.glb.
// Uso (desta pasta): node converter.mjs <Axe_Warrior.fbx> <Axe Warrior_Bake1_PBR_Diffuse.png> ../../assets/guerreiro/guerreiro.glb
// Usa o three r185 desta pasta (o do jogo, r170, não tem FBXLoader nem GLTFExporter).
// O que ele conserta no FBX: um esqueleto só (o FBXLoader duplica os ossos por malha),
// a pose de repouso = a da ligação (os dedos), as peças de armadura nos grupos (giro de −90°)
// e o V das UVs; a textura entra embutida.
import fs from 'node:fs';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, getContext: () => null }) };
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.(); }); } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); this.onload?.(); }); } };
const THREE = await import('./three.module.min.js');
const { FBXLoader } = await import('./addons/FBXLoader.js');
const { GLTFExporter } = await import('./addons/GLTFExporter.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};
const [, , FBX, PNG, SAIDA] = process.argv;
const buf = fs.readFileSync(FBX);
const fbx = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
fbx.updateMatrixWorld(true);

// o esqueleto canônico: um osso por nome, com o pai = o primeiro osso de outro nome acima
const mundo = {}, paiDe = {}, ordem = [];
fbx.traverse((o) => {
  if (!o.isBone || mundo[o.name]) return;
  mundo[o.name] = o.matrixWorld.clone(); ordem.push(o.name);
  let p = o.parent; while (p && p.isBone && p.name === o.name) p = p.parent;
  paiDe[o.name] = p?.isBone ? p.name : null;
});
// a pose de REPOUSO é a da LIGAÇÃO (o inverso do boneInverse), não a da cena: no
// arquivo, os dedos estão dobrados na cena e abertos na ligação (a mão esticava 2,8 m)
const ligacao = {};
fbx.traverse((o) => {
  if (!o.isSkinnedMesh) return;
  o.skeleton.bones.forEach((b, i) => { ligacao[b.name] ??= o.skeleton.boneInverses[i].clone().invert(); });
});
for (const n of ordem) if (ligacao[n]) mundo[n] = ligacao[n];
const raiz = new THREE.Group(); raiz.name = 'Guerreiro';
const ossos = {};
for (const n of ordem) {
  const b = new THREE.Bone(); b.name = n; ossos[n] = b;
  const pai = paiDe[n] ? ossos[paiDe[n]] : raiz;
  const pw = paiDe[n] ? mundo[paiDe[n]] : new THREE.Matrix4();
  new THREE.Matrix4().copy(pw).invert().multiply(mundo[n]).decompose(b.position, b.quaternion, b.scale);
  pai.add(b);
}
raiz.updateMatrixWorld(true);

const mat = new THREE.MeshStandardMaterial({ name: 'Guerreiro', roughness: 0.85, metalness: 0 });
const malhas = [];
fbx.traverse((o) => { if (o.isMesh) malhas.push(o); });
// o glTF lê a textura sem virar (flipY = false): o V das UVs do FBX vira aqui
for (const g of new Set(malhas.map((m) => m.geometry))) {
  const uv = g.attributes.uv; if (!uv) continue;
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
}
for (const m of malhas) {
  // o grupo de origem (Leg_Equipments, Full_Helmets…) vai no nome, para o jogo saber o que é peça de armadura
  const grupo = m.parent && !m.parent.isBone && m.parent !== fbx ? m.parent.name : '';
  if (m.isSkinnedMesh) {
    // o glTF liga a malha na posição DELA (bindMatrix = a matriz da malha); no FBX
    // elas podem diferir (as joelheiras soltavam). A ligação vai para a geometria,
    // e a malha fica na origem: bindMatrix = identidade = a matriz dela.
    // As peças de armadura moram em grupos (Leg_Equipments…) girados −90° em X, e o
    // FBXLoader soma esse giro à ligação: a peça ia parar deitada, longe do corpo.
    // Medido peça a peça (centro × osso de maior peso): o certo é a ligação SEM o grupo.
    const geo = m.geometry.clone();
    geo.applyMatrix4(new THREE.Matrix4().copy(m.parent.matrixWorld).invert().multiply(m.bindMatrix));
    const nova = new THREE.SkinnedMesh(geo, mat);
    nova.name = m.name; nova.userData.grupo = grupo;
    raiz.add(nova); nova.updateMatrixWorld(true);
    const sk = new THREE.Skeleton(m.skeleton.bones.map((b) => ossos[b.name]), m.skeleton.boneInverses.map((x) => x.clone()));
    nova.bind(sk, new THREE.Matrix4());
  } else {
    const nova = new THREE.Mesh(m.geometry, mat); nova.name = m.name;
    const osso = ossos[m.parent.name];
    new THREE.Matrix4().copy(osso.matrixWorld).invert().multiply(m.matrixWorld).decompose(nova.position, nova.quaternion, nova.scale);
    osso.add(nova);
  }
}
console.log(`ossos ${ordem.length} | malhas ${malhas.length}`);

const glb = await new GLTFExporter().parseAsync(raiz, { binary: true, onlyVisible: false });
// a textura entra à mão (no Node não há <canvas> para o exportador desenhá-la)
const dv = new DataView(glb);
const jLen = dv.getUint32(12, true);
const json = JSON.parse(Buffer.from(glb, 20, jLen).toString('utf8'));
let bin = Buffer.from(glb, 20 + jLen + 8, dv.getUint32(20 + jLen, true));
const png = fs.readFileSync(PNG);
const pad = (4 - (bin.length % 4)) % 4;
const off = bin.length + pad;
bin = Buffer.concat([bin, Buffer.alloc(pad), png]);
json.buffers[0].byteLength = bin.length;
json.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: png.length });
json.images = [{ bufferView: json.bufferViews.length - 1, mimeType: 'image/png' }];
json.samplers = [{ magFilter: 9729, minFilter: 9987 }];
json.textures = [{ sampler: 0, source: 0 }];
for (const m of json.materials) m.pbrMetallicRoughness.baseColorTexture = { index: 0 };
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const cab = Buffer.alloc(12); cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(bp.length, 0); cb.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(SAIDA, Buffer.concat([cab, cj, js, cb, bp]));
console.log('gravado', SAIDA, (fs.statSync(SAIDA).size / 1024 | 0) + ' KB', '| skins', json.skins.length, '| nós', json.nodes.length);
