// Um projeto ligado: escolhe a carta, despacha com a frota e avança o gate.
//
// Desde a F2 (29/10/2026) a vigília não grava PERFIL-IA em carta nenhuma (J10): lê a
// frota uma vez por passo e para se ela não estiver ok (J5). Impedido de CLI ou modelo
// pausa a versão da frota; limite de uso pausa o provedor, para todos os projetos (J6).
// Nenhum dos dois gasta tentativa da carta nem do teto diário. A ordem (correção J-A) é
// conferir, reservar e só então escrever no Plane: frota e pausas são relidas sob a
// trava na reserva, e a mudança Todo → In Progress acontece com o lease já tomado.

import { randomUUID } from 'node:crypto';
import { configuracaoVigilia } from './politica.js';
import { congelarFrota } from './frota.js';
import { CAUSAS_DA_FROTA } from './frota-pausas.js';

const GATES = ['READY TO DEV', 'READY TO TEST'];

// Tentativas que contam para o teto da carta: as que não pararam por causa da frota.
// Também não conta a que nem começou (SEM_INICIO: falha antes do executor, N3).
export function tentativasDaCarta(historico = []) {
  const daFrota = new Set(historico.filter(e => (e.tipo === 'RESULTADO_EXECUTOR' && CAUSAS_DA_FROTA.has(e.causa?.tipo)) ||
    (e.tipo === 'RESULTADO' && e.resultado === 'SEM_INICIO')).map(e => e.tentativaId));
  return historico.filter(e => e.tipo === 'TENTATIVA' && !daFrota.has(e.tentativaId)).length;
}

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
    const { contrato, erros } = await this.servico.contrato(id);
    const cfg = configuracaoVigilia(contrato);
    if (!cfg || erros.length) return nota({ motivoOciosa: 'contrato sem vigília válida' });
    if (!this.servico.podeDespachar(id)) return nota({ motivoOciosa: 'executor desligado ou identidade de escrita ausente' });
    const frota = await this.servico.lerFrota();
    if (frota.estado !== 'ok') return nota({ motivoOciosa: `frota ${frota.estado}: nenhuma vigília sem frota válida` });
    const congelada = congelarFrota(frota);
    const pausa = this.servico.pausasFrota.impedimento(await this.servico.pausasFrota.ler(), congelada);
    if (pausa) return nota({ motivoOciosa: pausa });
    const feitas = await this.livro.tentativas24h(id);
    if (feitas >= cfg.tetoPorDia) return nota({ motivoOciosa: `teto diário atingido (${feitas}/${cfg.tetoPorDia})` });
    const doProjeto = (await this.servico.fila()).itens.filter(i => i.projetoId === id);
    if (doProjeto.some(i => i.leaseSituacao === 'ativo')) return nota({ motivoOciosa: 'tentativa em curso (lease ativo)' });
    const tentativasDe = item => tentativasDaCarta(item.historico);
    const candidatas = doProjeto.filter(i => i.elegivel && GATES.includes(i.gate) && tentativasDe(i) < cfg.maxTentativasPorCarta);
    if (!candidatas.length) return nota({ motivoOciosa: 'nenhuma carta elegível', proximaCarta: null });
    const carta = candidatas[0];
    nota({ proximaCarta: carta.identificador, motivoOciosa: null });
    const gate = carta.gate;
    const pausas = this.servico.pausasFrota;
    let resultado;
    try {
      resultado = await this.servico.iniciarDespacho({ cartaId: carta.id, comandoId: cfg.comando, versaoCarta: carta.atualizadoEm,
        frotaVersao: congelada.versao, frotaHash: congelada.hash, chaveIdempotencia: randomUUID(), usuarioId: String(local.ligadaPor ?? 'vigilia'),
        conferirSobTrava: async (c) => { const motivo = pausas.impedimento(await pausas.ler(), c); if (motivo) throw new Error(`${motivo}; nada foi reservado`); },
        aposReservar: async () => {
          if (!(gate === 'READY TO DEV' && carta.estadoGrupo === 'unstarted')) return null;
          const r = await this.servico.mudarEstado(carta.id, id, 'started', carta.atualizadoEm);
          await this.livro.anotar(id, { tipo: 'ESTADO', cartaId: carta.id, carta: carta.identificador, grupo: 'started' });
          return { versaoCarta: r.versaoCarta };
        } });
    } catch (erro) {
      if (!erro.semInicio) throw erro;
      // Reservou e caiu antes do executor: fica no diário com causa infra e o motivo, sem gastar tentativa da carta.
      await this.livro.anotar(id, { tipo: 'TENTATIVA', cartaId: carta.id, carta: carta.identificador, tentativaId: erro.semInicio.tentativaId,
        resultado: 'SEM_INICIO', gate, frotaVersao: congelada.versao, causa: 'infra', motivo: String(erro.message).slice(0, 200) });
      return nota({ motivoOciosa: `${carta.identificador}: tentativa sem início (${String(erro.message).slice(0, 120)})` });
    }
    const historico = await this.servico.lerHistorico(carta.id);
    const detalhe = historico.find(e => e.tipo === 'RESULTADO_EXECUTOR' && e.tentativaId === resultado.tentativaId) ?? {};
    const causa = resultado.causa ?? detalhe.causa ?? null;
    await this.livro.anotar(id, { tipo: 'TENTATIVA', cartaId: carta.id, carta: carta.identificador, tentativaId: resultado.tentativaId,
      resultado: resultado.resultado ?? 'duplicada', gate, frotaVersao: resultado.frotaVersao ?? congelada.versao, ...(causa ? { causa: causa.tipo } : {}) });
    // Só a causa estruturada do executor decide (J-D): resumo e evidência têm texto do modelo.
    if (resultado.resultado === 'impedido' && causa?.tipo === 'limite') {
      const provedores = causa.provedor ? [causa.provedor] : [...new Set(Object.values(congelada.tuplas).map(t => t.provedor))];
      let ate;
      for (const provedor of provedores) ate = await this.servico.comTrava(() => pausas.pausarProvedor(provedor, cfg.pausaPorLimiteMinutos, 'limite de uso do provedor'));
      await this.livro.anotar(id, { tipo: 'PAUSA', ate, motivo: `limite de uso: ${provedores.join(', ')} (todos os projetos)` });
      return nota({ ultimaTentativa: resultado, motivoOciosa: `frota pausada até ${ate}: limite de uso de ${provedores.join(', ')}` });
    }
    if (resultado.resultado === 'impedido' && causa?.tipo === 'cli') {
      await this.servico.comTrava(() => pausas.pausarVersao(congelada, `CLI ou modelo ${causa.provedor ?? ''} impedido`.replace(/\s+/g, ' ').trim()));
      await this.livro.anotar(id, { tipo: 'PAUSA', motivo: `frota v${congelada.versao} pausada: CLI ou modelo impedido` });
      return nota({ ultimaTentativa: resultado, motivoOciosa: `frota v${congelada.versao} pausada: CLI ou modelo impedido` });
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
