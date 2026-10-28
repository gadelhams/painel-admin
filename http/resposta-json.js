// Escreve JSON na resposta. Não lê arquivo nem o corpo do pedido.

export class RespostaJson {
  enviar(res, corpo, status = 200) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(corpo));
  }
}
