// Diário da frota: leitura só. Filtra por carta quando ela vem na URL.

export class RotasOrqDiario {
  constructor({ resposta, lerDiarioFrota }) {
    this.resposta = resposta;
    this.lerDiarioFrota = lerDiarioFrota;
  }

  async tentar(req, res, url) {
    if (url.pathname !== '/api/orquestracao/diario' || req.method !== 'GET') return false;
    const cartaId = url.searchParams.get('carta');
    this.resposta.json(res, await this.lerDiarioFrota({ cartaId: /^[0-9a-f-]{36}$/i.test(cartaId ?? '') ? cartaId : null }));
    return true;
  }
}
