// Registro do perfil no card. A consulta só-leitura mora em consulta-perfil.js.

import { PROJETOS } from '../projetos.js';
import { lerCanalPlane } from './canal-plane.js';
import { prepararPlanoExecucao, validarSelecoes } from './modelos.js';
import { codificarPerfil, perfisDoCanal } from './perfil-plane.js';
import { contratoDoProjeto, recusa } from './contrato-local.js';

export class RegistroPerfil {
  constructor(servico, consulta) {
    this.s = servico;
    this.consulta = consulta;
  }

  async validar(cartaId, selecoes) {
    const dados = await this.consulta.modelos(cartaId);
    if (dados.impedimentos.length) throw new Error(dados.impedimentos.join('; '));
    const projeto = PROJETOS.find(p => p.plane === dados.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, this.s.raiz);
    const validadas = validarSelecoes(contrato, selecoes);
    let impedimentosExecucao = [];
    try { prepararPlanoExecucao(contrato, validadas); }
    catch (erro) { impedimentosExecucao = [erro.message]; }
    return { carta: dados.carta, selecoes: validadas, impedimentosExecucao,
      persistida: false, observacao: 'proposta validada contra o contrato; nenhuma alteração no Plane ou execução' };
  }

  async registrar(cartaId, selecoes, versaoCarta, chaveIdempotencia) {
    if (!this.s.identidades.size) throw new Error('identidade de escrita restrita não configurada');
    const dados = await this.consulta.modelos(cartaId);
    const escrita = this.s.identidade(dados.projetoId);
    if (!escrita?.escritorPerfil || !escrita?.autorEscrita) throw new Error('projeto fora do escopo de escrita');
    if (dados.impedimentos.length) throw new Error(dados.impedimentos.join('; '));
    const projeto = PROJETOS.find(p => p.plane === dados.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, this.s.raiz);
    const validadas = validarSelecoes(contrato, selecoes);
    const html = codificarPerfil({ projetoId: dados.projetoId, cartaId, chaveIdempotencia, versaoCarta, selecoes: validadas });
    return this.s.estado.comTrava(async () => {
      const canalAtual = await lerCanalPlane({ consultar: this.s.cliente(), projetoId: dados.projetoId, cartaId });
      const perfis = perfisDoCanal(canalAtual.interacoes, { projetoId: dados.projetoId, cartaId, autorId: escrita.autorEscrita });
      const repetido = perfis.find(p => p.chaveIdempotencia === chaveIdempotencia);
      if (repetido) {
        if (JSON.stringify(repetido.selecoes) !== JSON.stringify(validadas)) throw recusa('chave de idempotência usada com outro perfil');
        return { carta: dados.carta, persistida: true, duplicada: true, comentarioId: repetido.comentarioId };
      }
      if ((await this.s.estado.lerHistorico(cartaId)).some(e => e.tipo === 'PERFIL_PENDENTE' && e.chaveIdempotencia === chaveIdempotencia)) {
        throw recusa('registro anterior incerto; conferir o card antes de repetir');
      }
      const cartaAtual = await this.s.cliente()(`/projects/${dados.projetoId}/work-items/${cartaId}/`);
      if (cartaAtual.updated_at !== versaoCarta) throw recusa('carta mudou; recarregue antes de registrar o perfil');
      await this.s.estado.registrarEvento({ tipo: 'PERFIL_PENDENTE', cartaId, chaveIdempotencia });
      const comentarioId = await escrita.escritorPerfil({ projetoId: dados.projetoId, cartaId, html, chaveIdempotencia });
      await this.s.estado.registrarEvento({ tipo: 'PERFIL_REGISTRADO', cartaId, chaveIdempotencia, comentarioId });
      return { carta: dados.carta, persistida: true, duplicada: false, comentarioId };
    });
  }
}
