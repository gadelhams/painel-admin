// Handoff no card. Texto e voz não autorizam execução.

import { lerCanalPlane } from './canal-plane.js';
import { codificarHandoff, handoffsDoCanal, validarHandoff as validarEntradaHandoff } from './handoff-plane.js';
import { recusa } from './contrato-local.js';

export class HandoffServico {
  constructor(servico) { this.s = servico; }

  async validar(cartaId, entrada) {
    const dados = await this.s.fila();
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    const escrita = this.s.identidade(item.projetoId);
    if (!escrita?.escritorHandoff || !escrita?.autorEscrita) {
      throw new Error('identidade de escrita restrita indisponível para este projeto');
    }
    const normalizada = validarEntradaHandoff(entrada);
    if (normalizada.tentativaId) {
      const historico = await this.s.estado.lerHistorico(cartaId);
      if (!historico.some(e => e.tipo === 'TENTATIVA' && e.tentativaId === normalizada.tentativaId)) {
        throw new Error('tentativa não registrada no estado operacional');
      }
      if (normalizada.papel === 'validador') {
        const dadosCanal = await lerCanalPlane({ consultar: this.s.cliente(), projetoId: item.projetoId, cartaId });
        const anteriores = handoffsDoCanal(dadosCanal.interacoes, { projetoId: item.projetoId, cartaId, autorId: escrita.autorEscrita });
        if (!anteriores.some(h => h.papel === 'desenvolvedor' && h.tentativaId === normalizada.tentativaId)) {
          throw new Error('validação exige handoff do desenvolvedor na mesma tentativa');
        }
      }
    }
    return { carta: item.identificador, projetoId: item.projetoId, versaoCarta: item.atualizadoEm,
      entrada: normalizada, aviso: 'Handoff será gravado no card; texto e voz não autorizam execução.' };
  }

  async registrar(cartaId, entrada, versaoCarta, chaveIdempotencia) {
    const dados = await this.validar(cartaId, entrada).catch(e => { throw recusa(e.message); });
    if (dados.versaoCarta !== versaoCarta) throw recusa('carta mudou; recarregue antes de registrar handoff');
    const escrita = this.s.identidade(dados.projetoId);
    const html = codificarHandoff({ projetoId: dados.projetoId, cartaId, chaveIdempotencia, versaoCarta, ...dados.entrada });
    return this.s.estado.comTrava(async () => {
      const atual = await lerCanalPlane({ consultar: this.s.cliente(), projetoId: dados.projetoId, cartaId });
      const anteriores = handoffsDoCanal(atual.interacoes, { projetoId: dados.projetoId, cartaId, autorId: escrita.autorEscrita });
      const repetido = anteriores.find(h => h.chaveIdempotencia === chaveIdempotencia);
      if (repetido) {
        if (JSON.stringify(repetido.entrada ?? { papel: repetido.papel, tentativaId: repetido.tentativaId,
          resultado: repetido.resultado, resumo: repetido.resumo, evidencia: repetido.evidencia }) !== JSON.stringify(dados.entrada)) {
          throw new Error('chave de idempotência usada com outro handoff');
        }
        return { carta: dados.carta, persistido: true, duplicado: true, comentarioId: repetido.comentarioId };
      }
      const historico = await this.s.estado.lerHistorico(cartaId);
      if (historico.some(e => e.tipo === 'HANDOFF_PENDENTE' && e.chaveIdempotencia === chaveIdempotencia)) {
        throw recusa('handoff anterior incerto; conferir o card antes de repetir');
      }
      const cartaAtual = await this.s.cliente()(`/projects/${dados.projetoId}/work-items/${cartaId}/`);
      if (cartaAtual.updated_at !== versaoCarta) throw recusa('carta mudou; recarregue antes de registrar handoff');
      await this.s.estado.registrarEvento({ tipo: 'HANDOFF_PENDENTE', cartaId, chaveIdempotencia,
        papel: dados.entrada.papel, tentativaId: dados.entrada.tentativaId });
      const comentarioId = await escrita.escritorHandoff({ projetoId: dados.projetoId, cartaId, html, chaveIdempotencia });
      await this.s.estado.registrarEvento({ tipo: 'HANDOFF_REGISTRADO', cartaId, chaveIdempotencia, comentarioId,
        papel: dados.entrada.papel, tentativaId: dados.entrada.tentativaId });
      return { carta: dados.carta, persistido: true, duplicado: false, comentarioId };
    });
  }
}
