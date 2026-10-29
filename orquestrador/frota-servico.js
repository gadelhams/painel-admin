// Leitura e troca da frota pelo serviço. A gravação mora em frota.js; as duas ações, em api-frota.js.

import { catalogoPublico, PAPEIS_EXECUTOR, PAPEIS_ZELADOR, validarConteudoFrota } from './frota-catalogo.js';
import { recusa } from './contrato-local.js';
import { PausasFrota } from './frota-pausas.js';

export class FrotaServico {
  constructor(servico) { this.s = servico; }

  async ler() {
    const [frota, pausas, historico] = await Promise.all([this.s.frota.ler(), this.s.pausasFrota.ler(), this.s.frota.saudeHistorico()]);
    // A marca sai para a tela: é ela que volta no preparar como a versão que o dono viu.
    return { ...frota, catalogo: catalogoPublico(), papeis: { executor: [...PAPEIS_EXECUTOR], zelador: [...PAPEIS_ZELADOR] },
      pausas, historico, observacao: frota.estado === 'ok'
        ? 'A frota escolhe modelo e esforço de cada papel; o contrato de cada projeto continua sendo o interruptor.'
        : 'Sem frota válida, nenhum despacho nem vigília roda. Não há padrão de reserva.' };
  }

  // Preparar: o catálogo fechado recusa aqui, antes de qualquer desafio (J6). A base é a
  // marca que o dono viu na tela (J-B): se a frota já mudou desde o GET, recusa.
  async validarTroca(conteudo, marcaVista) {
    const validado = validarConteudoFrota(conteudo);
    if (typeof marcaVista !== 'string' || !marcaVista) throw recusa('marca da frota vista ausente; recarregue a frota');
    const atual = await this.s.frota.ler();
    if (atual.marca !== marcaVista) throw recusa('a frota mudou desde que você a abriu; recarregue antes de preparar');
    return { conteudo: validado, base: marcaVista, atual: { estado: atual.estado, versao: atual.versao ?? null, motivo: atual.motivo ?? null } };
  }

  // Confirmar: sob a trava global, a versão atual tem de ser a base do preparar (J4).
  async trocar(conteudo, base, usuarioId) {
    if (typeof base !== 'string' || !base) throw recusa('versão-base ausente; prepare de novo');
    return this.s.estado.comTrava(async () => {
      const troca = PausasFrota.troca(await this.s.pausasFrota.ler());
      const r = await this.s.frota.gravar({ conteudo, base, usuarioId, notaPausas: troca?.nota ?? null });
      if (troca) await this.s.pausasFrota.gravar(troca.novo);
      return { estado: r.estado, versao: r.versao, hash: r.hash, conteudo: r.conteudo, substituiu: r.substituiu };
    });
  }
}
