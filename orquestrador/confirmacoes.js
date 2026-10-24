import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ErroAcesso } from './sso.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRAZO_MS = 2 * 60_000;

// O teto protege a memória contra preparos abandonados; resultados retidos por 24 h
// para resposta idempotente não contam, senão 100 confirmações num dia trancariam a escrita.
export const pendentes = desafios => [...desafios.values()].filter(d => d.estado === 'pendente' || d.estado === 'executando').length;
const RETENCAO_RESULTADO_MS = 24 * 60 * 60_000;

// Desafio mantido só em memória: reiniciar o servidor cancela pendências,
// nunca confirma implicitamente. A chave de idempotência não vem do browser.
export function criarConfirmacoes({ servico, agora = () => Date.now(), prazoMs = PRAZO_MS } = {}) {
  const desafios = new Map();
  const limpar = () => { for (const [id, d] of desafios) {
    if ((d.estado === 'pendente' ? d.expiraEm : d.reterAte) <= agora()) desafios.delete(id);
  } };

  async function preparar({ carta, selecoes, versaoCarta }, identidade) {
    limpar();
    if (pendentes(desafios) >= 100) throw new ErroAcesso('muitas confirmações pendentes', 429);
    if (!UUID.test(carta ?? '') || typeof versaoCarta !== 'string' || !Number.isFinite(Date.parse(versaoCarta))) {
      throw new ErroAcesso('carta ou versão inválida', 422);
    }
    const dados = await servico.modelos(carta);
    if (!dados.podeRegistrar) throw new ErroAcesso('identidade de escrita restrita indisponível para este projeto', 503);
    if (dados.versaoCarta !== versaoCarta) throw new ErroAcesso('carta mudou; recarregue antes de preparar', 409);
    const validacao = await servico.validarModelos(carta, selecoes);
    const id = randomUUID();
    desafios.set(id, { estado: 'pendente', expiraEm: agora() + prazoMs, identidade, carta,
      versaoCarta, selecoes: validacao.selecoes, chaveIdempotencia: randomUUID() });
    return { confirmacaoId: id, expiraEm: new Date(agora() + prazoMs).toISOString(),
      carta: dados.carta, versaoCarta, selecoes: validacao.selecoes,
      aviso: 'Confirmar gravará este perfil no card do Plane; não iniciará execução.' };
  }

  async function confirmar(confirmacaoId, identidade) {
    if (!UUID.test(confirmacaoId ?? '')) throw new ErroAcesso('confirmação inválida', 422);
    const desafio = desafios.get(confirmacaoId);
    if (!desafio) throw new ErroAcesso('confirmação ausente ou expirada', 404);
    const mesmoUsuario = identidade.usuarioId === desafio.identidade.usuarioId;
    const hashA = Buffer.from(identidade.sessaoHash ?? '', 'hex');
    const hashB = Buffer.from(desafio.identidade.sessaoHash ?? '', 'hex');
    if (!mesmoUsuario || hashA.length !== 32 || hashB.length !== 32 || !timingSafeEqual(hashA, hashB)) {
      throw new ErroAcesso('confirmação pertence a outra sessão', 403);
    }
    if (desafio.estado === 'concluida') return desafio.resultado;
    if (desafio.estado !== 'pendente') throw new ErroAcesso('confirmação já usada ou resultado incerto', 409);
    if (desafio.expiraEm <= agora()) { desafios.delete(confirmacaoId); throw new ErroAcesso('confirmação expirada', 410); }
    desafio.estado = 'executando'; // Antes do primeiro await: concorrência não duplica escrita.
    try {
      const resultado = await servico.registrarModelos(desafio.carta, desafio.selecoes,
        desafio.versaoCarta, desafio.chaveIdempotencia);
      desafio.resultado = resultado;
      desafio.estado = 'concluida';
      desafio.reterAte = agora() + RETENCAO_RESULTADO_MS;
      return resultado;
    } catch (erro) {
      if (erro.semEscrita) { desafios.delete(confirmacaoId); throw new ErroAcesso(`recusado; nada foi gravado: ${erro.message}`, 422); }
      desafio.estado = 'incerta'; // Conserva chave/evento para auditoria, sem retry automático.
      desafio.reterAte = agora() + RETENCAO_RESULTADO_MS;
      throw erro;
    }
  }

  return { preparar, confirmar };
}
