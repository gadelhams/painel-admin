// Escolhe a família de /api/orquestracao. A recusa genérica vem depois das rotas específicas.

import { RotasOrqFila } from './rotas-orq-fila.js';
import { RotasOrqTriagem } from './rotas-orq-triagem.js';
import { RotasOrqCanal } from './rotas-orq-canal.js';
import { RotasOrqModelos } from './rotas-orq-modelos.js';
import { RotasOrqHandoff } from './rotas-orq-handoff.js';
import { RotasOrqGate } from './rotas-orq-gate.js';
import { RotasOrqDespacho } from './rotas-orq-despacho.js';
import { RotasOrqConsumo } from './rotas-orq-consumo.js';
import { RotasOrqVigilia } from './rotas-orq-vigilia.js';
import { RotasOrqLegado } from './rotas-orq-legado.js';
import { RotasOrqVoz } from './rotas-orq-voz.js';

export class RotasOrquestracao {
  constructor({ resposta, orquestracao, triagemDev, lerConsumo, vigilia, lerCanalLegado, apiPerfil, apiHandoff, apiGate, apiDespacho, apiVigilia, apiVoz, xai }) {
    this.resposta = resposta;
    this.fila = new RotasOrqFila({ resposta, orquestracao });
    this.triagem = new RotasOrqTriagem({ resposta, triagemDev });
    this.canal = new RotasOrqCanal({ resposta, orquestracao });
    this.modelos = new RotasOrqModelos({ resposta, orquestracao, apiPerfil });
    this.handoff = new RotasOrqHandoff({ resposta, apiHandoff });
    this.gate = new RotasOrqGate({ resposta, apiGate });
    this.despacho = new RotasOrqDespacho({ resposta, apiDespacho });
    this.consumo = new RotasOrqConsumo({ resposta, lerConsumo });
    this.vigilia = new RotasOrqVigilia({ resposta, vigilia, apiVigilia });
    this.legado = new RotasOrqLegado({ resposta, lerCanalLegado });
    this.voz = new RotasOrqVoz({ resposta, apiVoz, xai });
  }

  async tentar(req, res, url) {
    if (!url.pathname.startsWith('/api/orquestracao')) return false;
    for (const grupo of [this.fila, this.triagem, this.canal, this.modelos, this.handoff, this.gate, this.despacho, this.consumo, this.vigilia, this.legado, this.voz]) {
      if (await grupo.tentar(req, res, url)) return true;
    }
    this.resposta.json(res, { erro: 'escrita e execução indisponíveis nesta etapa' }, 405);
    return true;
  }
}
