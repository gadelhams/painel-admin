// Escolhe a família de /api/orquestracao. A recusa genérica vem depois das rotas específicas.

import { RotasOrqFila } from './rotas-orq-fila.js';
import { RotasOrqTriagem } from './rotas-orq-triagem.js';
import { RotasOrqCanal } from './rotas-orq-canal.js';
import { RotasOrqFrota } from './rotas-orq-frota.js';
import { RotasOrqHandoff } from './rotas-orq-handoff.js';
import { RotasOrqGate } from './rotas-orq-gate.js';
import { RotasOrqDespacho } from './rotas-orq-despacho.js';
import { RotasOrqConsumo } from './rotas-orq-consumo.js';
import { RotasOrqDiario } from './rotas-orq-diario.js';
import { RotasOrqVigilia } from './rotas-orq-vigilia.js';
import { RotasOrqVoz } from './rotas-orq-voz.js';

export class RotasOrquestracao {
  constructor({ resposta, orquestracao, triagemDev, lerConsumo, lerDiarioFrota, vigilia, apiFrota, apiHandoff, apiGate, apiDespacho, apiVigilia, apiVoz, xai }) {
    this.resposta = resposta;
    this.fila = new RotasOrqFila({ resposta, orquestracao });
    this.triagem = new RotasOrqTriagem({ resposta, triagemDev });
    this.canal = new RotasOrqCanal({ resposta, orquestracao });
    this.frota = new RotasOrqFrota({ resposta, orquestracao, apiFrota });
    this.handoff = new RotasOrqHandoff({ resposta, apiHandoff });
    this.gate = new RotasOrqGate({ resposta, apiGate });
    this.despacho = new RotasOrqDespacho({ resposta, apiDespacho });
    this.consumo = new RotasOrqConsumo({ resposta, lerConsumo });
    this.diario = new RotasOrqDiario({ resposta, lerDiarioFrota });
    this.vigilia = new RotasOrqVigilia({ resposta, vigilia, apiVigilia });
    this.voz = new RotasOrqVoz({ resposta, apiVoz, xai });
  }

  async tentar(req, res, url) {
    if (!url.pathname.startsWith('/api/orquestracao')) return false;
    for (const grupo of [this.fila, this.triagem, this.canal, this.frota, this.handoff, this.gate, this.despacho, this.consumo, this.diario, this.vigilia, this.voz]) {
      if (await grupo.tentar(req, res, url)) return true;
    }
    const soPost = /\/(preparar|confirmar|simular|transcrever)$/.test(url.pathname);
    this.resposta.naoPermitido(res, soPost ? 'POST' : 'GET, HEAD', 'escrita e execução indisponíveis nesta etapa');
    return true;
  }
}
