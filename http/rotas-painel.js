// Escolhe a família da rota. Cada família mora no arquivo ao lado.

import { RotasProjetos } from './rotas-projetos.js';
import { RotasProducao } from './rotas-producao.js';
import { RotasSsh } from './rotas-ssh.js';
import { RotasBacklog } from './rotas-backlog.js';
import { RotasDecisoes } from './rotas-decisoes.js';
import { RotasHangar } from './rotas-hangar.js';
import { RotasRelacoes } from './rotas-relacoes.js';
import { RotasContas } from './rotas-contas.js';
import { RedirecionamentoC3po } from './redirecionamento-c3po.js';
import { RotasSessao } from './rotas-sessao.js';

export class RotasPainel {
  constructor({ resposta, coletores, contas, ssh, autorizarContas, sessao }) {
    this.grupos = [
      new RotasProjetos({ resposta, coletores }),
      new RotasProducao({ resposta, coletores }),
      new RotasSsh({ resposta, ssh }),
      new RotasBacklog({ resposta, coletores }),
      new RotasDecisoes({ resposta, coletores }),
      new RotasHangar({ resposta, coletores }),
      new RotasRelacoes({ resposta, coletores }),
      new RotasContas({ resposta, contas, autorizar: autorizarContas }),
      new RotasSessao({ resposta, sessao }),
      new RedirecionamentoC3po(),
    ];
  }

  async tentar(req, res, url) {
    for (const grupo of this.grupos) {
      if (await grupo.tentar(req, res, url)) return true;
    }
    return false;
  }
}
