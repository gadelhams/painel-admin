// Leitura do texto PERFIL-IA/v1 legado. Não grava: desde a F2 da frota (29/10/2026) o perfil por carta não vincula nada.
//
// Um comentário ruim não derruba a carta: é contado como ilegível e o resto segue.

import { UUID } from './uuid.js';
const MARCADOR = 'PERFIL-IA/v1 ';

export function perfisDoCanal(interacoes, { projetoId, cartaId, autorId }) {
  const perfis = [];
  let ilegiveis = 0;
  if (!UUID.test(autorId ?? '')) return { perfis, ilegiveis };
  for (const e of interacoes) {
    if (!e.texto?.startsWith(MARCADOR) || e.autorId !== autorId) continue;
    try {
      const perfil = JSON.parse(Buffer.from(e.texto.slice(MARCADOR.length).split(/\s/)[0], 'base64url').toString('utf8'));
      if (perfil.versao !== 1 || perfil.projetoId !== projetoId || perfil.cartaId !== cartaId ||
          !perfil.selecoes || typeof perfil.selecoes !== 'object') throw new Error();
      perfis.push({ selecoes: perfil.selecoes, comentarioId: e.id, quando: e.quando });
    } catch { ilegiveis += 1; }
  }
  return { perfis, ilegiveis };
}
