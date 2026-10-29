// Freios da vigília declarados no contrato. Não varre nem despacha.
//
// Desde a F2 da frota (29/10/2026) `vigilia.perfilPadrao` não escolhe modelo nenhum: a
// frota manda. O campo continua opcional e, se presente, é conferido como antes, para
// que nenhum contrato hoje inválido vire válido por causa da troca (J1).

import { PAPEIS } from './modelos.js';

export const VIGILIA_PADRAO = Object.freeze({ maxTentativasPorCarta: 2, tetoPorDia: 6, pausaPorLimiteMinutos: 60 });
const LIMITES_VIGILIA = { maxTentativasPorCarta: [1, 5], tetoPorDia: [1, 50], pausaPorLimiteMinutos: [5, 1440] };

const normalizar = e => (e === 'extreme high' ? 'xhigh' : e);

function perfilLegadoConfere(contrato, perfil) {
  if (!perfil || typeof perfil !== 'object' || Array.isArray(perfil)) return false;
  if (Object.keys(perfil).some(p => !PAPEIS.includes(p))) return false;
  return PAPEIS.every(papel => {
    const e = perfil[papel];
    return e && (contrato.agentes ?? []).some(a => a.provedor === e.provedor && a.modelo === e.modelo &&
      (a.esforcos ?? [normalizar(a.esforco)]).includes(e.esforco));
  });
}

export function errosDaVigilia(contrato) {
  const v = contrato?.vigilia;
  if (v === undefined) return [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['vigilia: bloco inválido'];
  const erros = [];
  if (v.perfilPadrao !== undefined && !perfilLegadoConfere(contrato, v.perfilPadrao)) erros.push('vigilia.perfilPadrao: modelo ou esforço não permitido');
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
    comando: v.comando ?? contrato.comandos[0].id });
}
