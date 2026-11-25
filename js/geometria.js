/**
 * AS CONTAS DE ÂNGULO E DISTÂNCIA NO PLANO (24/11/2026: saíram do combat.js, que desenha, para o
 * cérebro dos inimigos rodar também no servidor). Posição é qualquer `{ x, z }`; o rumo (`facing`)
 * é o ângulo em Y, com 0 = olhando para +Z.
 */

/** O quanto o alvo está fora da frente de quem olha para `facing` (rad, de 0 a π). */
export function angleToTarget(fromPos, facing, toPos) {
  const dx = toPos.x - fromPos.x, dz = toPos.z - fromPos.z;
  const a = Math.atan2(dx, dz);
  let d = a - facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** O rumo de `from` para `to`. */
export function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

/** Gira `cur` na direção de `target` no máximo `maxStep` (pelo lado mais curto). */
export function turnTowards(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}

/** A distância no chão (sem a altura). */
export function flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
