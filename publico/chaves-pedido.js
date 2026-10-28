// Pedido da aba Chaves. O valor só sai no confirmar e não fica neste módulo.

class PedidoChaves {
  static async pedir(metodo, caminho, corpo) {
    const resposta = await fetch(caminho, { method: metodo, headers: corpo !== undefined ? { 'content-type': 'application/json' } : {}, body: corpo !== undefined ? JSON.stringify(corpo) : undefined });
    let dados = {};
    try { dados = await resposta.json(); } catch { /* corpo vazio */ }
    return { ok: resposta.ok, status: resposta.status, dados };
  }
}

globalThis.PedidoChaves = PedidoChaves;
