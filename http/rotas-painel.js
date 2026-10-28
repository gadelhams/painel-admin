// Escolhe a família da rota. Cada família mora no arquivo ao lado.

import { RotasProjetos } from './rotas-projetos.js';
import { RotasProducao } from './rotas-producao.js';
import { RotasSsh } from './rotas-ssh.js';
import { RotasBacklog } from './rotas-backlog.js';
import { RotasDecisoes } from './rotas-decisoes.js';
import { RotasRelacoes } from './rotas-relacoes.js';
import { RotasContas } from './rotas-contas.js';
import { RedirecionamentoSeverino } from './redirecionamento-severino.js';

export class RotasPainel {
  constructor({ resposta, coletores, contas, ssh }) {
    this.grupos = [
      new RotasProjetos({ resposta, coletores }),
      new RotasProducao({ resposta, coletores }),
      new RotasSsh({ resposta, ssh }),
      new RotasBacklog({ resposta, coletores }),
      new RotasDecisoes({ resposta, coletores }),
      new RotasRelacoes({ resposta, coletores }),
      new RotasContas({ resposta, contas }),
      new RedirecionamentoSeverino(),
    ];
  }

  async tentar(req, res, url) {
    for (const grupo of this.grupos) {
      if (await grupo.tentar(req, res, url)) return true;
    }
    return false;
  }
}
