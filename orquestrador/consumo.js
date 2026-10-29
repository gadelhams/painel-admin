// Apenas cota incluída na ASSINATURA. Nunca converter gasto/crédito de API em
// percentual do plano, nem aceitar uma amostra antiga como consumo atual.
export function percentualDeConsumo(amostra, { agora = Date.now(), idadeMaximaMs = 15 * 60_000 } = {}) {
  const { tipo, usado, limite, percentualUsado, unidade, janela, atualizadoEm, fonte, reiniciaEm = null } = amostra ?? {};
  if (tipo !== 'assinatura') return { disponivel: false, motivo: 'fonte não é consumo da assinatura' };
  const instante = Date.parse(atualizadoEm);
  const fracao = Number.isFinite(percentualUsado) ? percentualUsado
    : Number.isFinite(usado) && Number.isFinite(limite) && limite > 0 ? 100 * usado / limite : NaN;
  if (!Number.isFinite(fracao) || fracao < 0 || fracao > 100 ||
      !janela || !fonte || !Number.isFinite(instante) || instante > agora ||
      (percentualUsado === undefined && !unidade)) {
    return { disponivel: false, motivo: 'amostra da assinatura incompleta' };
  }
  const leitura = { tipo: 'assinatura', percentual: Math.round(fracao * 10) / 10, janela, atualizadoEm, fonte, reiniciaEm };
  if (agora - instante <= idadeMaximaMs) return { disponivel: true, ...leitura };
  // Velha não é atual: outros aparelhos gastam a mesma assinatura. Depois que a janela
  // zerou, nem como última leitura serve.
  const zerou = Number.isFinite(Date.parse(reiniciaEm)) && Date.parse(reiniciaEm) <= agora;
  return zerou
    ? { disponivel: false, motivo: `a janela (${janela}) zerou depois da última leitura` }
    : { disponivel: false, motivo: 'sem leitura recente da assinatura', ultimaLeitura: leitura };
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
          : amostras.length ? { ...percentualDeConsumo(amostras[0], { agora: agora() }), ultimasLeituras: amostras.map(a => percentualDeConsumo(a, { agora: agora() }).ultimaLeitura).filter(Boolean) }
            : { disponivel: false, motivo: fontes[provedor] ? 'nenhuma sessão recente com leitura de cota' : 'fonte da assinatura não conectada' };
      } catch {
        resultado[provedor] = { disponivel: false, motivo: 'fonte da assinatura indisponível' };
      }
    }
    return resultado;
  };
}
