// Esqueleto das duas ações privilegiadas: preparar guarda um desafio, confirmar o executa uma vez. Não sabe o que valida nem o que grava.
//
// O desafio vive só em memória: reiniciar o servidor cancela pendências, nunca
// confirma implicitamente. A chave de idempotência nasce aqui, nunca no browser.
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ErroAcesso } from './sso.js';

import { UUID } from './uuid.js';
const PRAZO_MS = 2 * 60_000;
const RETENCAO_RESULTADO_MS = 24 * 60 * 60_000;
const TETO_PENDENTES = 100;

// O teto protege a memória contra preparos abandonados; resultados retidos para
// resposta idempotente não contam, senão 100 confirmações num dia trancariam a escrita.
export const pendentes = desafios => [...desafios.values()].filter(d => d.estado === 'pendente' || d.estado === 'executando').length;

// Falha que provadamente não gravou nada vira recusa limpa; o resto fica "incerta",
// conserva chave e evento para auditoria e nunca é repetido automaticamente.
const recusaPadrao = erro => (erro.semEscrita ? new ErroAcesso(`recusado; nada foi gravado: ${erro.message}`, 422) : null);

export function criarDesafios({ validar, executar, agora = () => Date.now(), prazoMs = PRAZO_MS,
  retencaoMs = RETENCAO_RESULTADO_MS, recusaLimpa = recusaPadrao }) {
  const desafios = new Map();
  const limpar = () => { for (const [id, d] of desafios) if ((d.estado === 'pendente' ? d.expiraEm : d.reterAte) <= agora()) desafios.delete(id); };

  async function preparar(entrada, identidade) {
    limpar();
    if (pendentes(desafios) >= TETO_PENDENTES) throw new ErroAcesso('muitas confirmações pendentes', 429);
    const { guardar, resposta } = await validar(entrada, identidade);
    const id = randomUUID();
    const expiraEm = agora() + prazoMs;
    desafios.set(id, { estado: 'pendente', expiraEm, identidade, guardado: { ...guardar, chaveIdempotencia: randomUUID() } });
    return { confirmacaoId: id, expiraEm: new Date(expiraEm).toISOString(), ...resposta };
  }

  async function confirmar(id, identidade, extra) {
    if (!UUID.test(id ?? '')) throw new ErroAcesso('confirmação inválida', 422);
    const d = desafios.get(id);
    if (!d) throw new ErroAcesso('confirmação ausente ou expirada', 404);
    const a = Buffer.from(identidade.sessaoHash ?? '', 'hex');
    const b = Buffer.from(d.identidade.sessaoHash ?? '', 'hex');
    if (identidade.usuarioId !== d.identidade.usuarioId || a.length !== 32 || b.length !== 32 || !timingSafeEqual(a, b)) {
      throw new ErroAcesso('confirmação pertence a outra sessão', 403);
    }
    if (d.estado === 'concluida') return d.resultado;
    if (d.estado !== 'pendente') throw new ErroAcesso('confirmação já usada ou resultado incerto', 409);
    if (d.expiraEm <= agora()) { desafios.delete(id); throw new ErroAcesso('confirmação expirada', 410); }
    d.estado = 'executando'; // Antes do primeiro await: concorrência não duplica escrita.
    try {
      d.resultado = await executar(d.guardado, identidade, extra);
      d.estado = 'concluida';
      d.reterAte = agora() + retencaoMs;
      return d.resultado;
    } catch (erro) {
      const recusa = recusaLimpa(erro);
      if (recusa) { desafios.delete(id); throw recusa; }
      d.estado = 'incerta';
      d.reterAte = agora() + retencaoMs;
      throw erro;
    }
  }

  return { preparar, confirmar };
}
