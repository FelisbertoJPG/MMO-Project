/**
 * O CÉREBRO certo para cada FICHA (24/11/2026): o `comportamento` da ficha (tipos.js) escolhe a
 * classe — `humanoide` (o padrão) ou `quadrupede`. É o que o servidor do Mundo online usa para criar
 * as criaturas sem corpo; no navegador, o corpo de cada comportamento é `Enemy` (enemies.js) ou
 * `Animal` (animais.js), que herdam destes. Comportamento novo = a classe dele aqui.
 */
import { Humanoide } from './humanoide.js';
import { Quadrupede } from './quadrupede.js';

export const COMPORTAMENTOS = { humanoide: Humanoide, quadrupede: Quadrupede };

/** O cérebro (sem corpo) da criatura de ficha `cfg`, nascendo em `pos` olhando para `rumo`. */
export function criarCerebro(mundo, cfg, pos, rumo = 0, opts = {}) {
  const Classe = COMPORTAMENTOS[cfg.comportamento ?? 'humanoide'];
  if (!Classe) throw new Error(`comportamento desconhecido: ${cfg.comportamento}`);
  return new Classe(mundo, cfg, pos, rumo, opts);
}
