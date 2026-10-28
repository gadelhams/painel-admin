// Checagem do despacho real. A prévia sem lease mora em simulacao-despacho.js; a tentativa, em tentativa-despacho.js.

import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { comandoPermitido } from './politica.js';
import { prepararPlanoExecucao } from './modelos.js';
import { RAIZ, contratoDoProjeto } from './contrato-local.js';

const REPOSITORIO = path.resolve(import.meta.dirname, '..');

export class ChecagemDespacho {
  constructor(servico) { this.s = servico; }

  async validar(cartaId, comandoId, versaoCarta, ignorarLeaseId = null) {
    if (!this.s.execucaoHabilitada || !this.s.executor) throw new Error('portão de execução desligado');
    const dados = await this.s.fila({ ignorarLeaseId });
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!this.s.podeDespachar(item.projetoId)) throw new Error('projeto fora do escopo de execução');
    if (!item.elegivel) throw new Error(`carta impedida: ${item.motivos.join('; ')}`);
    if (item.atualizadoEm !== versaoCarta) throw new Error('carta mudou; recarregue antes de despachar');
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato, erros } = await contratoDoProjeto(projeto, this.s.raiz);
    if (!contrato || erros.length) throw new Error('contrato local ausente ou inválido');
    const comando = comandoPermitido(contrato, comandoId);
    const perfil = await this.s.lerPerfil(item.projetoId, cartaId);
    if (!perfil) throw new Error('perfil de modelos não registrado no card');
    const plano = prepararPlanoExecucao(contrato, perfil.selecoes);
    const pasta = this.s.raiz === RAIZ && projeto.pasta === 'painel-admin' ? REPOSITORIO
      : path.join(this.s.raiz, projeto.pasta, projeto.subRepo ?? '');
    await this.s.executor.validar({ pasta, contrato, comando, plano, carta: item });
    return { carta: item.identificador, cartaId, projetoId: item.projetoId, versaoCarta,
      comandoId, comando, plano, contrato, gate: item.gate, perfilComentarioId: perfil.comentarioId, pasta };
  }
}
