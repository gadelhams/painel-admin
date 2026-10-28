// Um projeto ligado: escolhe a carta, despacha e avança o gate.

import { randomUUID } from 'node:crypto';
import { configuracaoVigilia } from './politica.js';

const LIMITE_DE_USO = /limite de uso do provedor|usage limit|rate limit|too many requests/i;
const GATES = ['READY TO DEV', 'READY TO TEST'];

export class PassoVigilia {
  constructor({ servico, registrarLog, livro, memoria, controle }) {
    this.servico = servico;
    this.registrarLog = registrarLog;
    this.livro = livro;
    this.memoria = memoria;
    this.controle = controle;
  }

  async reler(cartaId) {
    return (await this.servico.fila()).itens.find(x => x.id === cartaId) ?? null;
  }

  async projeto(p, local) {
    const id = p.plane;
    const nota = campos => { this.memoria.set(id, { ...this.memoria.get(id), ultimaVarredura: this.livro.iso(), ...campos }); return { projetoId: id, ...this.memoria.get(id) }; };
    if (local.pausadaAte && Date.parse(local.pausadaAte) > this.controle.agora()) return nota({ motivoOciosa: `pausada até ${local.pausadaAte}: ${local.motivoPausa ?? ''}`.trim() });
    const { contrato, erros } = await this.servico.contrato(id);
    const cfg = configuracaoVigilia(contrato);
    if (!cfg || erros.length) return nota({ motivoOciosa: 'contrato sem vigília válida' });
    if (!this.servico.podeDespachar(id)) return nota({ motivoOciosa: 'executor desligado ou identidade de escrita ausente' });
    const feitas = await this.livro.tentativas24h(id);
    if (feitas >= cfg.tetoPorDia) return nota({ motivoOciosa: `teto diário atingido (${feitas}/${cfg.tetoPorDia})` });
    const doProjeto = (await this.servico.fila()).itens.filter(i => i.projetoId === id);
    if (doProjeto.some(i => i.leaseSituacao === 'ativo')) return nota({ motivoOciosa: 'tentativa em curso (lease ativo)' });
    const tentativasDe = item => (item.historico ?? []).filter(e => e.tipo === 'TENTATIVA').length;
    const candidatas = doProjeto.filter(i => i.elegivel && GATES.includes(i.gate) && tentativasDe(i) < cfg.maxTentativasPorCarta);
    if (!candidatas.length) return nota({ motivoOciosa: 'nenhuma carta elegível', proximaCarta: null });
    let carta = candidatas[0];
    nota({ proximaCarta: carta.identificador, motivoOciosa: null });
    const gate = carta.gate;
    if (gate === 'READY TO DEV' && carta.estadoGrupo === 'unstarted') {
      await this.servico.mudarEstado(carta.id, id, 'started', carta.atualizadoEm);
      await this.livro.anotar(id, { tipo: 'ESTADO', cartaId: carta.id, carta: carta.identificador, grupo: 'started' });
      carta = await this.reler(carta.id);
      if (!carta) return nota({ motivoOciosa: 'carta sumiu da fila após mudar o estado' });
    }
    const modelos = await this.servico.modelos(carta.id);
    let perfilComentarioId = modelos.perfil?.comentarioId ?? null;
    if (!perfilComentarioId) {
      const r = await this.servico.registrarModelos(carta.id, cfg.perfilPadrao, modelos.versaoCarta, randomUUID());
      perfilComentarioId = r.comentarioId;
      await this.livro.anotar(id, { tipo: 'PERFIL', cartaId: carta.id, carta: carta.identificador, comentarioId: perfilComentarioId });
      carta = await this.reler(carta.id);
      if (!carta) return nota({ motivoOciosa: 'carta sumiu da fila após registrar o perfil' });
    }
    if (!carta.elegivel) return nota({ motivoOciosa: `${carta.identificador} deixou de ser elegível: ${carta.motivos.join('; ')}` });
    const resultado = await this.servico.iniciarDespacho({ cartaId: carta.id, comandoId: cfg.comando, versaoCarta: carta.atualizadoEm,
      perfilComentarioId, chaveIdempotencia: randomUUID(), usuarioId: String(local.ligadaPor ?? 'vigilia') });
    await this.livro.anotar(id, { tipo: 'TENTATIVA', cartaId: carta.id, carta: carta.identificador, tentativaId: resultado.tentativaId,
      resultado: resultado.resultado ?? 'duplicada', gate });
    const historico = await this.servico.lerHistorico(carta.id);
    const detalhe = historico.find(e => e.tipo === 'RESULTADO_EXECUTOR' && e.tentativaId === resultado.tentativaId) ?? {};
    if (resultado.resultado === 'impedido' && LIMITE_DE_USO.test(`${detalhe.resumo ?? ''} ${(detalhe.evidencia ?? []).join(' ')}`)) {
      const ate = await this.controle.pausar(id, cfg.pausaPorLimiteMinutos, 'limite de uso do provedor');
      return nota({ ultimaTentativa: resultado, motivoOciosa: `pausada até ${ate}: limite de uso do provedor` });
    }
    if (resultado.resultado === 'concluido') {
      try {
        const atual = await this.reler(carta.id);
        if (!atual) throw new Error('carta sumiu da fila antes do avanço');
        if (gate === 'READY TO DEV') {
          const evidencias = [`tentativa ${resultado.tentativaId}`, ...(detalhe.evidencia ?? [])].slice(0, 10).map(x => String(x).slice(0, 500));
          const r = await this.servico.registrarGate(atual.id, { gate: 'READY TO TEST',
            justificativa: `Vigília: tentativa ${resultado.tentativaId.slice(0, 8)} concluída — comando ${cfg.comando} passou e a validação devolveu APROVADO; a carta passa à fase de teste.`,
            evidencias }, atual.atualizadoEm, randomUUID(), 'READY TO DEV');
          await this.livro.anotar(id, { tipo: 'AVANCO', cartaId: carta.id, carta: carta.identificador, de: 'READY TO DEV', para: 'READY TO TEST', comentarioId: r.comentarioId });
        } else {
          const r = await this.servico.mudarEstado(atual.id, id, 'completed', atual.atualizadoEm, 'READY TO TEST');
          await this.livro.anotar(id, { tipo: 'AVANCO', cartaId: carta.id, carta: carta.identificador, de: 'READY TO TEST', para: r.estadoNome });
        }
      } catch (erro) {
        await this.livro.anotar(id, { tipo: 'ERRO', cartaId: carta.id, carta: carta.identificador, etapa: 'avanco', motivo: erro.message });
        this.registrarLog(`[vigilia] avanço de ${carta.identificador} falhou: ${erro.message}`);
      }
    } else if (resultado.resultado === 'rejeitado' && tentativasDe(carta) + 1 >= cfg.maxTentativasPorCarta) {
      await this.livro.anotar(id, { tipo: 'ESGOTADA', cartaId: carta.id, carta: carta.identificador, tentativas: tentativasDe(carta) + 1 });
    }
    return nota({ ultimaTentativa: resultado });
  }
}
