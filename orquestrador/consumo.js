// Apenas cota incluída na ASSINATURA. Nunca converter gasto/crédito de API em
// percentual do plano, nem aceitar uma amostra antiga como consumo atual.
export function percentualDeConsumo(amostra, { agora = Date.now(), idadeMaximaMs = 15 * 60_000 } = {}) {
  const { tipo, usado, limite, percentualUsado, unidade, janela, atualizadoEm, fonte } = amostra ?? {};
  if (tipo !== 'assinatura') return { disponivel: false, motivo: 'fonte não é consumo da assinatura' };
  const instante = Date.parse(atualizadoEm);
  const fracao = Number.isFinite(percentualUsado) ? percentualUsado
    : Number.isFinite(usado) && Number.isFinite(limite) && limite > 0 ? 100 * usado / limite : NaN;
  if (!Number.isFinite(fracao) || fracao < 0 || fracao > 100 ||
      !janela || !fonte || !Number.isFinite(instante) || instante > agora || agora - instante > idadeMaximaMs ||
      (percentualUsado === undefined && !unidade)) {
    return { disponivel: false, motivo: 'amostra da assinatura incompleta ou desatualizada' };
  }
  return {
    disponivel: true, tipo: 'assinatura', percentual: Math.round(fracao * 10) / 10,
    janela, atualizadoEm, fonte,
  };
}

export function criarLeitorConsumo({ fontes = {}, agora = () => Date.now() } = {}) {
  return async function lerConsumo() {
    const resultado = {};
    for (const provedor of ['claude', 'openai']) {
      try {
        const resposta = await fontes[provedor]?.();
        const amostras = resposta === undefined ? [] : Array.isArray(resposta) ? resposta : [resposta];
        const janelas = amostras.map(a => percentualDeConsumo(a, { agora: agora() })).filter(a => a.disponivel);
        resultado[provedor] = janelas.length ? { disponivel: true, tipo: 'assinatura', janelas }
          : { disponivel: false, motivo: amostras.length ? percentualDeConsumo(amostras[0], { agora: agora() }).motivo : 'fonte da assinatura não conectada' };
      } catch {
        resultado[provedor] = { disponivel: false, motivo: 'fonte da assinatura indisponível' };
      }
    }
    return resultado;
  };
}
