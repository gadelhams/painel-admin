// Pedido da aba Contas. Uma chamada por ação; o valor nunca fica aqui.

class PedidoContas {
  static async pedir(metodo, caminho, corpo) {
    const resposta = await fetch(caminho, {
      method: metodo,
      headers: corpo !== undefined ? { 'content-type': 'application/json' } : {},
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    let dados = {};
    try { dados = await resposta.json(); } catch { /* corpo vazio */ }
    return { ok: resposta.ok, status: resposta.status, dados };
  }

  static erro(r) {
    return r.dados?.erro ? `${r.dados.erro} (HTTP ${r.status})` : `falha HTTP ${r.status}`;
  }
}

globalThis.PedidoContas = PedidoContas;
