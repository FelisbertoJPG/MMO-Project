/**
 * **O PALCO DA CRIAÇÃO DE PERSONAGEM** (19/11/2026; js/perfis.js): o ambiente escuro com o
 * personagem iluminado. A cela continua na cena, mas a câmera só desenha a CAMADA do palco
 * (o corpo, o chão e o halo).
 *
 * Nenhuma luz nasce, apaga ou troca de `visible` aqui: TODAS entram na camada do palco, então
 * a lista de luzes é a mesma do jogo e nada recompila. O que muda são números, e o
 * `World.updateAmbience` os devolve a cada quadro. Por isso `antes()` roda depois dele, logo
 * antes de desenhar. A exceção é a luz que acompanha o jogador: essa o `fechar()` restaura.
 */
import * as THREE from 'three';

const CAMADA_PALCO = 29;   // (a 30 é a sombra das árvores em cartaz e a 31, a do que o LOD escondeu)
const FUNDO = 0x060504;
const _frente = new THREE.Vector3();
const marcar = (o) => o.layers.enable(CAMADA_PALCO);

/** Uma textura de degradê redondo: `paradas` = [[lugar de 0 a 1, cor CSS], …]. */
function degrade(paradas) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d'), d = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [lugar, cor] of paradas) d.addColorStop(lugar, cor);
  g.fillStyle = d;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function folha(geometria, paradas, ordem) {
  const m = new THREE.Mesh(geometria, new THREE.MeshBasicMaterial({ map: degrade(paradas), transparent: true, depthWrite: false, toneMapped: false, fog: false }));
  m.layers.set(CAMADA_PALCO);
  m.renderOrder = ordem;
  m.visible = false;
  return m;
}

export class PalcoDaCriacao {
  constructor(game) {
    this.game = game;
    this.chao = null;
    this.halo = null;
  }

  abrir() {
    const g = this.game, p = g.player, luz = p.soulLight;
    g.scene.traverse((o) => { if (o.isLight) marcar(o); });
    if (!this.chao) {
      // (criados uma vez e guardados: abrir e fechar a tela não cria material de novo)
      this.chao = folha(new THREE.CircleGeometry(1.7, 48), [[0, 'rgba(8,6,4,.78)'], [0.17, 'rgba(8,6,4,.42)'], [0.27, 'rgba(176,134,84,.3)'], [1, 'rgba(176,134,84,0)']], -9);
      this.chao.rotation.x = -Math.PI / 2;
      this.halo = folha(new THREE.PlaneGeometry(7, 7), [[0, 'rgba(92,68,40,.62)'], [0.45, 'rgba(50,36,22,.3)'], [1, 'rgba(20,14,8,0)']], -10);
      g.scene.add(this.chao, this.halo);
    }
    this.chao.position.set(p.pos.x, p.pos.y + 0.012, p.pos.z);
    this.chao.visible = this.halo.visible = true;
    this.luzAntes = { pos: luz.position.clone(), cor: luz.color.getHex(), forca: luz.intensity };
    document.body.classList.add('criando-perfil');
  }

  fechar() {
    const luz = this.game.player.soulLight, a = this.luzAntes;
    if (this.chao) this.chao.visible = this.halo.visible = false;
    if (a) { luz.position.copy(a.pos); luz.color.setHex(a.cor); luz.intensity = a.forca; }
    this.luzAntes = null;
    document.body.classList.remove('criando-perfil');
  }

  /** Logo antes de desenhar o quadro. */
  antes() {
    const g = this.game, p = g.player, amb = g.world.ambience, cam = g.camera, luz = p.soulLight;
    g.scene.background.setHex(FUNDO);
    g.scene.fog.density = 0;
    amb.hemi.color.setHex(0x8f8676);
    amb.hemi.groundColor.setHex(0x2b241d);
    amb.hemi.intensity = 2.2;
    amb.amb.intensity = 1.1;
    // a luz principal acompanha a volta da câmera: o personagem fica aceso de todos os lados
    const lado = g.editorAparencia.giro + 0.65;
    luz.position.set(Math.sin(lado) * 2.1, 2.5, Math.cos(lado) * 2.1);
    luz.color.setHex(0xffe2bd);
    luz.intensity = 17;
    // (o corpo é refeito a cada mudança na aparência: as peças novas nascem fora da camada)
    p.model.root.traverse(marcar);
    p.model.guerreiro?.cena?.traverse(marcar);
    cam.getWorldDirection(_frente);
    this.halo.position.set(p.pos.x + _frente.x * 1.6, p.pos.y + 1 + _frente.y * 1.6, p.pos.z + _frente.z * 1.6);
    this.halo.quaternion.copy(cam.quaternion);
    this.mascara = cam.layers.mask;
    cam.layers.set(CAMADA_PALCO);
  }

  /** Logo depois de desenhar. */
  depois() { this.game.camera.layers.mask = this.mascara; }
}
