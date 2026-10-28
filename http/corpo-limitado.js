// Lê o corpo do pedido até o teto. Acima disso corta a conexão.

export class CorpoLimitado {
  constructor({ maxCorpo }) {
    this.maxCorpo = maxCorpo;
  }

  ler(req) {
    return new Promise((resolve, reject) => {
      const pedacos = [];
      let tamanho = 0;
      req.on('data', (pedaco) => {
        tamanho += pedaco.length;
        if (tamanho > this.maxCorpo) {
          reject(new Error('corpo grande demais'));
          req.destroy();
          return;
        }
        pedacos.push(pedaco);
      });
      req.on('end', () => resolve(Buffer.concat(pedacos).toString('utf8')));
      req.on('error', reject);
    });
  }
}
