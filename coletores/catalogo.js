// Catálogo estático de relações. Rota e motor leem daqui, não de relacoes.js direto.

import { RELACOES, NOS_EXTRA } from '../relacoes.js';

export async function catalogoRelacoes() {
  return { relacoes: RELACOES, nosExtra: NOS_EXTRA };
}
