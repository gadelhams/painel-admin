// Prévia do despacho. Não reserva lease, não abre processo e não escreve no Plane.

import { PROJETOS } from '../projetos.js';
import { comandoPermitido } from './politica.js';
import { prepararPlanoExecucao } from './modelos.js';
import { contratoDoProjeto } from './contrato-local.js';

export class SimulacaoDespacho {
  constructor(servico) { this.s = servico; }

  async simular(cartaId, comandoId, selecoes = null) {
    const dados = await this.s.fila();
    const item = dados.itens.find(x => x.id === cartaId || x.identificador === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!item.elegivel) return { executaria: false, motivos: item.motivos, carta: item.identificador };
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, this.s.raiz);
    comandoPermitido(contrato, comandoId);
    const perfil = !selecoes && this.s.identidade(item.projetoId)?.autorEscrita ? await this.s.lerPerfil(item.projetoId, item.id) : null;
    const escolhas = selecoes ?? perfil?.selecoes;
    if (!escolhas) return { executaria: false, carta: item.identificador, comando: comandoId,
      motivos: ['perfil de modelos por papel não selecionado; execução não pode escolher agente por fallback'],
      observacao: 'simulação sem lease, processo ou escrita no Plane' };
    const plano = prepararPlanoExecucao(contrato, escolhas);
    return { executaria: true, carta: item.identificador, comando: comandoId, plano,
      perfilRegistrado: Boolean(perfil),
      observacao: 'simulação sem lease, processo ou escrita no Plane; escolhas enviadas na requisição são apenas prévia' };
  }
}
