// Pedido da aba Contas. Uma chamada por ação; o valor nunca fica aqui.

class PedidoContas {
  static async pedir(metodo, caminho, corpo) {
    // Escrita é ação privilegiada (SSO): o servidor só aceita JSON, então até as ações sem
    // corpo mandam `{}`.
    const escrita = metodo !== 'GET';
    const resposta = await fetch(caminho, {
      method: metodo,
      headers: escrita ? { 'content-type': 'application/json' } : {},
      body: escrita ? JSON.stringify(corpo ?? {}) : undefined,
    });
    let dados = {};
    try { dados = await resposta.json(); } catch { /* corpo vazio */ }
    return { ok: resposta.ok, status: resposta.status, dados };
  }

  static erro(r) {
    if (r.status === 401) return `${r.dados?.erro ?? 'sessão ausente'}: entre em https://astargne.com/login e abra o painel por https://painel.vpn.astargne.com (HTTP 401)`;
    return r.dados?.erro ? `${r.dados.erro} (HTTP ${r.status})` : `falha HTTP ${r.status}`;
  }
}

globalThis.PedidoContas = PedidoContas;
