// Consulta do perfil vinculante e do catálogo. O registro mora em registro-perfil.js.

import { PROJETOS } from '../projetos.js';
import { lerCanalPlane } from './canal-plane.js';
import { catalogoModelos, PAPEIS, validarSelecoes } from './modelos.js';
import { perfisDoCanal } from './perfil-plane.js';
import { contratoDoProjeto } from './contrato-local.js';

export class ConsultaPerfil {
  constructor(servico) { this.s = servico; }

  async ler(projetoId, cartaId) {
    const autorId = this.s.identidade(projetoId)?.autorEscrita;
    if (!autorId) return null;
    const canal = await lerCanalPlane({ consultar: this.s.cliente(), projetoId, cartaId });
    return perfisDoCanal(canal.interacoes, { projetoId, cartaId, autorId })
      .sort((a, b) => String(a.quando ?? '').localeCompare(String(b.quando ?? ''))).at(-1) ?? null;
  }

  async modelos(cartaId) {
    const dados = await this.s.fila();
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato, erros } = await contratoDoProjeto(projeto, this.s.raiz);
    const perfil = contrato && !erros.length ? await this.ler(item.projetoId, item.id) : null;
    if (perfil) validarSelecoes(contrato, perfil.selecoes);
    return { carta: item.identificador, projetoId: item.projetoId, versaoCarta: item.atualizadoEm,
      papeis: PAPEIS, opcoes: contrato && !erros.length ? catalogoModelos(contrato) : [],
      perfil, podeRegistrar: Boolean(this.s.identidade(item.projetoId)?.escritorPerfil && this.s.identidade(item.projetoId)?.autorEscrita),
      impedimentos: erros.length ? erros : contrato ? [] : ['contrato local ausente'] };
  }
}
