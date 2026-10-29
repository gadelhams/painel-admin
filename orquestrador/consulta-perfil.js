// O perfil antigo da carta, só para exibir "perfil antigo ignorado (era X; roda a frota vN)". Não entra no despacho.
//
// Estados distintos (correção J-L3): `inexistente` (o fio foi lido e não há perfil),
// `ignorado` (há, e a frota manda), `ilegivel`, e — montados por quem chama —
// `indisponivel` (o fio não pôde ser lido) e `nao-lido` (carta sem gate não lê o fio).

import { perfisDoCanal } from './protocolo-perfil.js';
import { UUID } from './uuid.js';

const texto = v => String(v ?? '?').replace(/[^\w./-]/g, '').slice(0, 40) || '?';

export function perfilAntigoDoCanal(interacoes, alvo) {
  if (!UUID.test(alvo?.autorId ?? '')) return { estado: 'indisponivel', motivo: 'identidade técnica não configurada' };
  try {
    const { perfis, ilegiveis } = perfisDoCanal(interacoes, alvo);
    const ultimo = [...perfis].sort((a, b) => String(a.quando ?? '').localeCompare(String(b.quando ?? ''))).at(-1);
    if (!ultimo) return ilegiveis ? { estado: 'ilegivel', resumo: 'perfil antigo ilegível' } : { estado: 'inexistente' };
    const resumo = Object.entries(ultimo.selecoes).slice(0, 4)
      .map(([papel, e]) => `${texto(papel)} ${texto(e?.provedor)}/${texto(e?.modelo)}/${texto(e?.esforco)}`).join(' · ');
    return { estado: 'ignorado', resumo, comentarioId: ultimo.comentarioId, quando: ultimo.quando ?? null };
  } catch {
    return { estado: 'ilegivel', resumo: 'perfil antigo ilegível' };
  }
}
