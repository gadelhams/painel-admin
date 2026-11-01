// O portão do gate do zelador: a proposta PRONTA da CLI só vira READY TO DEV depois de tudo conferido ao vivo pelo painel. Não escreve no Plane (o escritor é escritor-gate-zelador.js).
//
// F4b (contrato da F4 itens 4 e 5; J58, J59, J60, J72 do parecer de 31/10/2026):
// - elegível só em projeto com play, contrato `.orquestrador.json` válido, identidade técnica de
//   escrita e a sandbox bwrap do executor funcional (sem ela, falha fechada, com o motivo); a
//   mesma regra decide, na fila, se o recibo do zelador é aceito (`elegibilidade`);
// - a carta: candidata do retrato e intocável nenhum (folha, sem gate, sem lease, sem reserva…)
//   relido ao vivo; nenhum ancestral com trava (BLOQUEIOS, PRODUTO ou marcador humano na
//   descrição); `RegistroGate.validar` ao vivo — ProntidaoGate, preavaliação e relações relidas;
// - J58: nunca marca gate em carta cuja trava o próprio zelador levantou (etiqueta de trava
//   tirada, marcador, dependência ou código de carta tirados da descrição, relação removida,
//   dependência fechada)
//   até o dono reconhecer — um `DECISAO/v1` da mesa na carta, depois do levantamento;
// - chave = UUIDv5(carta | gate | digital): a mesma carta, no mesmo estado, dá o mesmo recibo;
// - sob a trava só o fencing do lease, lease/tentativa/reserva e o escritor (teto de 20 s);
// - PAINEL-62: depois das conferências e do juiz real (`preavaliar`), se o juiz só aponta o
//   Backlog e/ou a declaração ausente, o PRONTA ganha um preparo (zelador-preparo.js), escrito pela
//   sequência da limpeza (PENDENTE → intenção → PATCH único → recibo); o gate sai depois com a
//   digital da releitura do preparo (D1). Preparo feito e gate recusado = PREPARADO_SEM_GATE, com
//   um comentário na carta (salvo lease ou reserva de outro: aí só o diário, como na B4).
import { BLOQUEIOS, DECISAO_HUMANA_NA_DESCRICAO } from './marcas-carta.js';
import { atorDe, digitalDaCarta, ehDecisaoDaMesa, motivoIntocavel, nomesDe, ZELADOR_ATOR } from './zelador-politica.js';
import { tocaMarcadorHumano } from './zelador-veredito.js';
import { listar } from './zelador-retrato.js';
import { uuidV5 } from './uuid.js';
import { codigosEm, htmlPreparadoSemGate, planoDoPreparo, textoRemovido } from './zelador-preparo.js';
import { textoDoHtml } from './zelador-veredito.js';
import { VOCABULARIO_DEPENDENCIA } from './texto-dependencia.js';

const GATE = 'READY TO DEV';
const DIA_MS = 24 * 60 * 60_000;
const TRAVAS = Object.freeze([...BLOQUEIOS, 'PRODUTO']);
const TERMINAIS = Object.freeze(['completed', 'cancelled', 'canceled']);
const CAMPOS_DE_RELACAO = /^(?:blocked_by|blocking|relates_to|start_before|finish_before|start_after|finish_after)$/;
const abortar = (motivo, intocavel = false) => Object.assign(new Error(motivo), { abortar: true, intocavel });

/**
 * A regra de elegibilidade do gate do zelador num projeto: { ok, motivo, ator }. Serve ao job
 * (antes de propor) e à fila (antes de aceitar o recibo dele). Qualquer leitura que falha = inelegível.
 */
export function criarElegibilidadeGateZelador({ sandbox, play, contrato, identidade, ator = ZELADOR_ATOR }) {
  return async (projetoId) => {
    const nao = motivo => ({ ok: false, motivo, ator });
    const sonda = sandbox ? await sandbox.sondar().catch(e => ({ ok: false, motivo: e.message })) : { ok: false, motivo: 'sandbox não configurada' };
    if (!sonda.ok) return nao(`sandbox bwrap indisponível (${sonda.motivo})`);
    if (!(await play.ligado(projetoId))) return nao('play do projeto desligado ou suspenso');
    const { contrato: c, erros } = await contrato(projetoId);
    if (!c || erros.length) return nao('projeto sem contrato .orquestrador.json válido');
    if (!identidade(projetoId)?.autorEscrita) return nao('projeto sem identidade técnica de escrita conferida');
    return { ok: true, motivo: null, ator };
  };
}

// Trava num ancestral (épico com ASTARGNE/PRODUTO, marcador na descrição); pai fora da leitura = trava.
function travaNosAncestrais(carta, porId) {
  const vistos = new Set([carta.id]);
  for (let pai = carta.parent; pai; pai = porId.get(pai)?.parent) {
    if (vistos.has(pai)) return 'ciclo na cadeia de pais';
    vistos.add(pai);
    const c = porId.get(pai);
    if (!c) return 'ancestral fora da leitura do catálogo';
    const trava = nomesDe(c).find(n => TRAVAS.includes(n));
    if (trava) return `ancestral ${c.sigla ?? ''}-${c.sequence_id} com ${trava}`;
    if (DECISAO_HUMANA_NA_DESCRICAO.test(c.description_html ?? '')) return `ancestral ${c.sigla ?? ''}-${c.sequence_id} com decisão humana na descrição`;
  }
  return null;
}

// As travas que o zelador levantou nesta carta, pelas atividades: { quando, motivo }[]. D7
// (PAINEL-62; J2 da correção): tirar da descrição um código de carta, ou uma linha com o
// vocabulário de dependência (o mesmo da anti-lavagem), também é levantar trava — a lavagem em
// duas passadas: ATUALIZAR tira "Precisa do CAD-31" ou "Requer o deploy antes", o PRONTA seguinte
// declararia "nenhuma". Descrição vazia (null) é legível. J5: a atividade ilegível vale do
// `created_at` dela; sem instante legível, da atividade legível mais recente da carta, e o motivo
// diz depois de quando o DECISAO/v1 do dono a reconhece.
function levantamentosDoZelador(atividades, ator = ZELADOR_ATOR) {
  const saida = [];
  const instantes = atividades.map(a => Date.parse(a.created_at)).filter(Number.isFinite);
  const maisRecente = instantes.length ? Math.max(...instantes) : NaN;
  for (const a of atividades.filter(x => atorDe(x) === ator)) {
    const quando = Date.parse(a.created_at);
    const antes = a.old_value ?? '';
    const depois = a.new_value ?? '';
    if (a.field === 'labels' && TRAVAS.includes(a.old_value) && a.new_value !== a.old_value) saida.push({ quando, motivo: `${a.old_value} tirada pelo zelador` });
    else if (a.field === 'description' && (typeof antes !== 'string' || typeof depois !== 'string')) {
      const q = Number.isFinite(quando) ? quando : maisRecente;
      saida.push({ quando: q, motivo: `atividade de descrição do zelador ilegível; o dono reconhece com DECISAO/v1 posterior a ${Number.isFinite(q) ? new Date(q).toISOString() : 'uma atividade legível (nenhuma na carta)'}` });
    } else if (a.field === 'description' && tocaMarcadorHumano(antes) && !tocaMarcadorHumano(depois)) saida.push({ quando, motivo: 'marcador ou dependência tirados da descrição pelo zelador' });
    else if (a.field === 'description' && (codigosEm(textoDoHtml(antes)).some(x => !codigosEm(textoDoHtml(depois)).includes(x))
      || VOCABULARIO_DEPENDENCIA.test(textoRemovido(antes, depois)))) {
      saida.push({ quando, motivo: 'código de carta ou dependência em prosa tirados da descrição pelo zelador' });
    } else if (CAMPOS_DE_RELACAO.test(a.field ?? '') && a.old_value && !a.new_value) saida.push({ quando, motivo: 'relação tirada pelo zelador' });
  }
  return saida;
}

// Reconhecido = DECISAO/v1 da mesa na carta, de outro ator, depois do levantamento.
const reconhecido = (levantamento, comentarios, ator = ZELADOR_ATOR) => comentarios.some(c => ehDecisaoDaMesa(c) && atorDe(c) !== ator
  && Date.parse(c.created_at) > levantamento.quando);

export class GateZelador {
  constructor({ job, elegibilidade }) { this.j = job; this.elegibilidade = elegibilidade; }

  // As dependências formais (blocked_by) da carta que o zelador fechou: { quando, motivo }[]. Ilegível lança.
  async dependenciasFechadas(relacoes, porId) {
    const ids = (Array.isArray(relacoes?.blocked_by) ? relacoes.blocked_by : [])
      .map(r => (typeof r === 'string' ? r : r?.id ?? r?.issue_id ?? r?.related_work_item ?? null)).filter(Boolean);
    const saida = [];
    for (const id of ids) {
      const dep = porId.get(id);
      if (!dep) throw abortar('dependência fora da leitura do catálogo');
      const atividades = await listar(this.j.consultar, `/projects/${dep.projetoId}/work-items/${id}/activities/`)
        .catch(() => { throw abortar(`atividades da dependência ${dep.sigla}-${dep.sequence_id} ilegíveis`); });
      const estados = await listar(this.j.consultar, `/projects/${dep.projetoId}/states/`).catch(() => null);
      const grupo = a => estados?.find(e => e.id === a.new_identifier || e.name === a.new_value)?.group ?? null;
      for (const a of atividades.filter(x => atorDe(x) === ZELADOR_ATOR && x.field === 'state')) {
        if (!estados) throw abortar('estados da dependência ilegíveis');
        if (TERMINAIS.includes(grupo(a))) saida.push({ quando: Date.parse(a.created_at), motivo: `dependência ${dep.sigla}-${dep.sequence_id} fechada pelo zelador` });
      }
    }
    return saida;
  }

  // As conferências ao vivo antes de escrever: { manter, posse } ou { atual, digital }. `digitalEsperada`
  // é a do retrato, ou a D1 da releitura do preparo (D10).
  async conferirCarta(v, cartaId, digitalEsperada, mudouDesde = 'o retrato') {
    const j = this.j;
    const { porId } = await j.retrato.cartasDoProjeto(j.projeto);
    const atual = porId.get(cartaId);
    if (!atual || atual.projetoId !== j.projeto.plane) return { manter: 'carta sumiu do Plane' };
    const [d, mesa] = await Promise.all([j.retrato.detalhes(j.projeto.plane, cartaId), j.retrato.mesaPendente()]);
    const intocavel = motivoIntocavel(atual, { porId, ...d, agoraMs: j.agora(), mesaPendente: mesa && mesa.has(v.identificador.toUpperCase()) });
    if (intocavel) return { manter: intocavel, posse: Boolean(d.lease || d.reserva) };
    const noAncestral = travaNosAncestrais(atual, porId);
    if (noAncestral) return { manter: `trava no ancestral: ${noAncestral}` };
    // J58: o que o próprio zelador levantou nesta carta ou nas dependências dela, sem o dono reconhecer.
    const levantados = [...levantamentosDoZelador(d.atividades), ...(await this.dependenciasFechadas(d.relacoes, porId))]
      .filter(l => !Number.isFinite(l.quando) || !reconhecido(l, d.comentarios));
    if (levantados.length) return { manter: `${levantados[0].motivo}; o zelador não marca gate até o dono reconhecer (DECISAO/v1)` };
    const digital = digitalDaCarta(atual, d.comentarios);
    if (digital !== digitalEsperada) return { manter: `a carta mudou desde ${mudouDesde}` };
    return { atual, digital };
  }

  // O gate em si: juiz real (J59), chave UUIDv5(carta | gate | digital) e o escritor sob a trava.
  async marcar(v, cartaId, digital) {
    const j = this.j;
    const pid = j.projeto.plane;
    const manter = motivo => ({ resultado: 'MANTER', motivo });
    const proposta = { gate: GATE, justificativa: `Zelador do Hangar, conferido ao vivo pelo painel: ${v.comentario}`.slice(0, 2000),
      evidencias: [...v.evidencias.map(e => e.texto), 'prontidão READY TO DEV, preavaliação e relações conferidas ao vivo; ancestrais sem trava'].slice(0, 10).map(x => String(x).slice(0, 500)) };
    // J59: a prontidão do juiz real, ao vivo (fila pela Guest, relações relidas).
    let validado;
    try { validado = await j.servico.validarGate(cartaId, proposta); } catch (e) { return manter(`prontidão ao vivo recusou: ${e.message}`); }
    const chave = uuidV5(`${cartaId}|${GATE}|${digital}`);
    await j.estado.registrarEvento({ tipo: 'GATE_PENDENTE', cartaId, chaveIdempotencia: chave, gate: GATE, origem: 'zelador', jobId: j.jobId });
    const r = await j.escritor.marcarGate({ projetoId: pid, cartaId, chaveIdempotencia: chave, versaoCarta: validado.versaoCarta,
      justificativa: proposta.justificativa, evidencias: proposta.evidencias,
      sobTrava: acao => j.sobFencing(async () => {
        if (await j.estado.lerLease(cartaId).catch(() => ({ ilegivel: true }))) throw abortar('lease de despacho apareceu na carta', true);
        const historico = await j.estado.lerHistorico(cartaId).catch(() => null);
        if (!historico || historico.some(e => e.tipo === 'TENTATIVA' && j.agora() - Date.parse(e.quando) < DIA_MS)) throw abortar('tentativa de despacho na carta', true);
        const reserva = j.cartaReservada ? await j.cartaReservada(cartaId).catch(() => ({ motivo: 'reservas ilegíveis' })) : null;
        if (reserva) throw abortar(`carta reservada por outra sessão: ${reserva.motivo}`, true);
        return acao();
      }) });
    if (!r.conferiu) {
      await j.estado.registrarEvento({ tipo: 'GATE_DIVERGENTE', cartaId, chaveIdempotencia: chave, gate: GATE, origem: 'zelador' });
      await j.comTrava(() => j.play.suspenderSobTrava(pid, `divergência na verificação do gate de ${v.identificador}`));
      return { resultado: 'DIVERGENTE', motivo: 'a releitura do gate não conferiu; play do projeto suspenso' };
    }
    await j.estado.registrarEvento({ tipo: 'GATE_APLICADO', cartaId, chaveIdempotencia: chave, gate: GATE, origem: 'zelador', comentarioId: r.comentarioId });
    return { resultado: 'APLICADO' };
  }

  // Devolve { resultado: MANTER|APLICADO|ABORTADO|DIVERGENTE|PREPARADO_SEM_GATE, motivo? }.
  async aplicar(v) {
    const j = this.j;
    const carta = j.r.porIdentificador.get(v.identificador);
    const manter = motivo => ({ resultado: 'MANTER', motivo });
    const eleg = await this.elegibilidade(j.projeto.plane).catch(e => ({ ok: false, motivo: e.message }));
    if (!eleg.ok) return manter(`gate do zelador inelegível: ${eleg.motivo}`);
    try {
      const conferida = await this.conferirCarta(v, carta.id, j.r.digitais.get(carta.id));
      if (conferida.manter) return manter(conferida.manter);
      // D4: o juiz real antes de qualquer escrita, também a do preparo.
      let pre;
      try { pre = await j.servico.preavaliar(carta.id, GATE); } catch (e) { return manter(`prontidão ao vivo recusou: ${e.message}`); }
      const plano = planoDoPreparo(pre, conferida.atual);
      if (plano.manter) return manter(plano.manter);
      if (!plano.mudanca) return await this.marcar(v, carta.id, conferida.digital);
      return await this.prepararEMarcar(v, carta, plano.mudanca);
    } catch (erro) {
      if (erro.abortar || erro.escopo) return { resultado: 'ABORTADO', motivo: erro.escopo ? 'play desligado no meio da sequência; o gate não saiu' : erro.message };
      throw erro;
    }
  }

  // O preparo pela sequência da limpeza e o gate com a digital da releitura (D10); gate que não
  // sai depois do preparo aplicado vira PREPARADO_SEM_GATE (D12), nunca um MANTER genérico. J3 da
  // correção: um erro comum no gate também deixa o diário e a carta dizendo que o preparo saiu, e
  // só então segue. J10: a chave do comentário é a da intenção do preparo, nunca a D1 (que pode faltar).
  async prepararEMarcar(v, carta, mudanca) {
    const j = this.j;
    const preparado = await j.aplicacao.aplicar({ ...v, mudanca });
    if (preparado.resultado === 'MANTER') return { resultado: 'MANTER', motivo: `preparo recusado: ${preparado.motivo}` };
    if (preparado.resultado !== 'APLICADO') return { resultado: preparado.resultado, motivo: `preparo: ${preparado.motivo}` };
    const semGate = async gate => {
      let motivo = `preparo aplicado, mas o READY TO DEV não saiu: ${gate.motivo}`;
      if (!gate.posse) {
        await j.aplicacao.comentarSobFencing(carta.id, htmlPreparadoSemGate(gate.motivo), `${preparado.chave}:sem-gate`)
          .catch(e => { motivo += `; comentário não gravado: ${e.message}`; });
      }
      return { resultado: 'PREPARADO_SEM_GATE', motivo };
    };
    let gate;
    try {
      const comentarios = await listar(j.consultar, `/projects/${j.projeto.plane}/work-items/${carta.id}/comments/`).catch(() => null);
      const d1 = comentarios && preparado.cartaVerificada ? digitalDaCarta(preparado.cartaVerificada, comentarios) : null;
      const conferida = d1 === null ? { manter: 'releitura do preparo ou comentários ilegíveis; sem a digital D1 o gate não sai' } : await this.conferirCarta(v, carta.id, d1, 'o preparo');
      gate = conferida.manter ? { resultado: 'MANTER', motivo: conferida.manter, posse: conferida.posse } : await this.marcar(v, carta.id, d1);
    } catch (erro) {
      if (!erro.abortar && !erro.escopo) {
        const r = await semGate({ motivo: `erro no gate: ${erro.message}`, posse: false });
        await j.anotar({ tipo: 'VEREDITO', carta: v.identificador, veredito: v.veredito, resultado: r.resultado, motivo: r.motivo });
        throw erro;
      }
      gate = { resultado: 'ABORTADO', motivo: erro.escopo ? 'play desligado no meio da sequência' : erro.message, posse: Boolean(erro.intocavel || erro.escopo) };
    }
    if (gate.resultado === 'APLICADO') return gate;
    if (gate.resultado === 'DIVERGENTE') return { ...gate, motivo: `preparo aplicado; ${gate.motivo}` };
    return semGate(gate);
  }
}
