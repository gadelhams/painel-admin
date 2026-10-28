// Freios da vigília declarados no contrato. Não varre nem despacha.

import { PAPEIS, validarSelecoes } from './modelos.js';

export const VIGILIA_PADRAO = Object.freeze({ maxTentativasPorCarta: 2, tetoPorDia: 6, pausaPorLimiteMinutos: 60 });
const LIMITES_VIGILIA = { maxTentativasPorCarta: [1, 5], tetoPorDia: [1, 50], pausaPorLimiteMinutos: [5, 1440] };

export function errosDaVigilia(contrato) {
  const v = contrato?.vigilia;
  if (v === undefined) return [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['vigilia: bloco inválido'];
  const erros = [];
  try { validarSelecoes(contrato, v.perfilPadrao); } catch (e) { erros.push(`vigilia.perfilPadrao: ${e.message}`); }
  for (const [chave, [min, max]] of Object.entries(LIMITES_VIGILIA)) {
    if (v[chave] !== undefined && !(Number.isInteger(v[chave]) && v[chave] >= min && v[chave] <= max)) erros.push(`vigilia.${chave} fora de ${min}..${max}`);
  }
  if (v.comando !== undefined && !contrato.comandos?.some(c => c.id === v.comando)) erros.push('vigilia.comando não está nos comandos do contrato');
  const extras = Object.keys(v).filter(k => !['perfilPadrao', 'comando', ...Object.keys(LIMITES_VIGILIA)].includes(k));
  if (extras.length) erros.push(`vigilia: campos desconhecidos ${extras.join(', ')}`);
  return erros;
}

export function configuracaoVigilia(contrato) {
  if (!contrato?.vigilia || errosDaVigilia(contrato).length) return null;
  const v = contrato.vigilia;
  return Object.freeze({ ...VIGILIA_PADRAO, ...Object.fromEntries(Object.keys(LIMITES_VIGILIA).filter(k => v[k] !== undefined).map(k => [k, v[k]])),
    comando: v.comando ?? contrato.comandos[0].id,
    perfilPadrao: Object.freeze(Object.fromEntries(PAPEIS.map(p => [p, { provedor: v.perfilPadrao[p].provedor, modelo: v.perfilPadrao[p].modelo, esforco: v.perfilPadrao[p].esforco }]))) });
}
