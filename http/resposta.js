// Porta da resposta. JSON, arquivo estático e corpo com teto moram ao lado.

import { RespostaJson } from './resposta-json.js';
import { ArquivoPublico } from './arquivo-publico.js';
import { CorpoLimitado } from './corpo-limitado.js';

export class RespostaHttp {
  constructor({ publico, maxCorpo }) {
    this.jsonResposta = new RespostaJson();
    this.arquivos = new ArquivoPublico({ publico, json: this.jsonResposta });
    this.corpos = new CorpoLimitado({ maxCorpo });
  }

  json(res, corpo, status) { return this.jsonResposta.enviar(res, corpo, status); }
  estatico(res, urlPath) { return this.arquivos.enviar(res, urlPath); }
  corpo(req) { return this.corpos.ler(req); }
}
