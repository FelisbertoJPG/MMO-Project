/**
 * A CAMUFLAGEM da FURTIVIDADE (21/11/2026; o card Passos Leves, caminhos.js): o boneco ESCURECE,
 * como uma sombra. É só a COR dos materiais (um uniforme): nada de shader novo. Transparência seria
 * OUTRO programa, compilado na hora — e já custou trancos de mais de 1 s numa placa fraca (ver
 * `Remoto.aplicarOpacidade`). Vale para o jogador (Player.update) e para o outro jogador que chega
 * furtivo pela rede (Remoto, o campo `f` do instantâneo).
 *
 * Material que não é SÓ do boneco (as armas dividem os do `Gear.mats` com todo mundo) ganha uma
 * cópia própria antes de escurecer: a cópia tem o mesmo programa (nada a compilar) e fica com ele.
 */
export const ESCURO = 0.22;

/** Uma cópia do material que mantém o gancho de shader dele (o `clone` do three não copia). */
function copia(m) {
  const c = m.clone();
  c.onBeforeCompile = m.onBeforeCompile;
  c.customProgramCacheKey = m.customProgramCacheKey;
  c.userData.camuflado = false;
  return c;
}

/**
 * Escurece (`ligado`) ou devolve a cor do boneco `model` (CharacterModel). Ligado, roda a cada
 * quadro: peça que apareceu depois (trocou a arma, vestiu outra armadura) escurece também.
 */
export function camuflar(model, ligado) {
  const root = model.root;
  if (!ligado && !root.userData.camuflado) return;
  root.userData.camuflado = ligado;
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (ligado && !o.visible) return;
    if (ligado && !o.userData.matProprio) {
      // os do próprio boneco (CharacterModel clona os seus ao nascer) não precisam de cópia
      const meus = model.flashMats ?? [];
      if (Array.isArray(o.material)) o.material = o.material.map((m) => (meus.includes(m) ? m : copia(m)));
      else if (!meus.includes(o.material)) o.material = copia(o.material);
      o.userData.matProprio = true;
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m.color) continue;
      const ud = m.userData;
      if (ligado && !ud.camuflado) { ud.corDaCamuflagem = m.color.getHex(); m.color.multiplyScalar(ESCURO); ud.camuflado = true; }
      else if (!ligado && ud.camuflado) { m.color.setHex(ud.corDaCamuflagem); ud.camuflado = false; }
    }
  });
}
