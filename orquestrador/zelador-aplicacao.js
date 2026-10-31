// A sequência de escrita de UM veredito do zelador e a reconciliação do que ficou pela metade: PENDENTE → intenção → mudança sob a trava → verificação → recibo → APLICADO. Não chama a CLI.
//
// Ordem (J26–J28, J53, J57, J58, J62–J65 do plano e do parecer de 31/10/2026; B1–B19 da correção):
// 1. tudo reconferido AO VIVO antes de escrever: o que não se toca, a digital (J24), o ato
//    humano (J57) e a prontidão de todas as cartas abertas do projeto e das que esperam por esta,
//    em qualquer projeto do catálogo (J58, B1); relação ilegível no universo aborta (B10);
// 2. diário PENDENTE no índice fora da rotação, com uma tentativa nova na chave (B15);
// 3. comentário de intenção, com o `external_id` da mudança estruturada + digital de antes;
// 4. a mudança: sob a trava global (J64) só o fencing do lease (J53), a ausência de lease e de
//    tentativa de despacho, a releitura e o PATCH (B19); 5. verificação só dos campos escritos
//    (J65), fora da trava; 6. recibo; 7. RESOLVIDO. Verificação que não confere marca DIVERGENTE no
//    índice e suspende o play ANTES do recibo (B17): o recibo de fechamento sai com o play
//    desligado ou suspenso (B13). Abortar porque a carta ficou intocável (lease, tentativa, ato de
//    outro ator) não escreve na carta: o recibo fica só no diário local (B4).
// Queda entre 3 e 6: o próximo job do projeto acha o PENDENTE e fecha: recibo já gravado (pela
// chave exata), carta sumida (só diário, B14), mudança feita (recibo), feita e desfeita por outro
// ator (recibo DESFEITO, B16), play desligado (só recibo), ou rola para a frente com as mesmas checagens.
import { randomUUID } from 'node:crypto';
import { digitalDaCarta, ehZelador, motivoIntocavel, nomesDe, prontidaoDoProjeto, reversas, violaAtoHumano, violaProntidao } from './zelador-politica.js';
import { RESULTADOS_RECIBO, chaveDaMudanca, htmlIntencao, htmlRecibo, mesmoTexto, mudancaNaListaFechada, novaDescricao } from './zelador-veredito.js';
import { ORIGEM_ZELADOR } from './escritor-zelador-plane.js';
import { listar } from './zelador-retrato.js';

const DIA_MS = 24 * 60 * 60_000;
const TERMINAIS = ['completed', 'cancelled', 'canceled'];
const GRUPOS = { completed: ['completed'], cancelled: ['cancelled', 'canceled'] };
// `intocavel`: a carta ficou fora do alcance do zelador; o fechamento não escreve nela (B4).
const abortar = (motivo, intocavel = false) => Object.assign(new Error(motivo), { abortar: true, intocavel });
const identificadorDe = c => `${c.sigla}-${c.sequence_id}`;

// A carta depois da mudança, para a prontidão simulada.
function aplicarNaCopia(carta, mudanca, { descricaoNova, estados }) {
  const copia = { ...carta, labels: [...(carta.labels ?? [])] };
  if (mudanca.tipo === 'estado') {
    const alvo = estados.find(e => GRUPOS[mudanca.grupo].includes(e.group)) ?? { id: 'simulado', name: mudanca.grupo, group: mudanca.grupo };
    copia.state = { id: alvo.id, name: alvo.name, group: alvo.group };
  } else if (mudanca.tipo === 'labels') {
    copia.labels = [...copia.labels.filter(l => !mudanca.remover.includes(l.name)), ...mudanca.adicionar.map(name => ({ id: `nova-${name}`, name }))];
  } else copia.description_html = descricaoNova;
  return copia;
}

function jaAplicada(carta, mudanca, descricaoNova) {
  if (mudanca.tipo === 'estado') return GRUPOS[mudanca.grupo].includes(carta.state?.group);
  if (mudanca.tipo === 'labels') { const n = nomesDe(carta); return mudanca.adicionar.every(x => n.includes(x)) && mudanca.remover.every(x => !n.includes(x)); }
  return mesmoTexto(carta.description_html, descricaoNova);
}

// B16: o próprio zelador fez esta mudança depois da intenção (e outro ator a desfez depois).
function zeladorAplicou(atividades, mudanca, { estados, descricaoNova, desde }) {
  const grupo = a => estados.find(e => e.id === a.new_identifier)?.group ?? estados.find(e => e.name === a.new_value)?.group;
  return atividades.some(a => ehZelador(a) && Date.parse(a.created_at) >= desde && (
    mudanca.tipo === 'estado' ? a.field === 'state' && GRUPOS[mudanca.grupo].includes(grupo(a))
      : mudanca.tipo === 'labels' ? a.field === 'labels' && (mudanca.adicionar.includes(a.new_value) || (mudanca.remover.includes(a.old_value) && !a.new_value))
        : a.field === 'description' && mesmoTexto(a.new_value, descricaoNova)));
}

// O resultado do recibo do zelador para ESTA chave (B15: pela chave exata, nunca pela ordem).
const resultadoDoRecibo = (c, chave) => {
  const m = /^([0-9a-f]{64}):recibo:([A-Z]+)$/.exec(String(c.external_id ?? ''));
  return m && m[1] === chave && RESULTADOS_RECIBO.includes(m[2]) ? m[2] : null;
};

export class AplicacaoZelador {
  constructor({ job }) { this.j = job; }

  get projetoId() { return this.j.projeto.plane; }

  async motivoAgora(carta, porId) {
    const [d, mesa] = await Promise.all([this.j.retrato.detalhes(this.projetoId, carta.id), this.j.retrato.mesaPendente()]);
    return { d, motivo: motivoIntocavel(carta, { porId, ...d, agoraMs: this.j.agora(), mesaPendente: mesa && mesa.has(identificadorDe(carta).toUpperCase()) }) };
  }

  // Lê a carta e o catálogo de novo e diz se a mudança ainda pode ser escrita. Lança `abortar`.
  async conferirAoVivo(cartaId, mudanca, digitalAntes) {
    const { cartas, porId } = await this.j.retrato.cartasDoProjeto(this.j.projeto);
    const carta = porId.get(cartaId);
    if (!carta || carta.projetoId !== this.projetoId) throw abortar('carta sumiu do Plane', true);
    const { d, motivo } = await this.motivoAgora(carta, porId);
    if (motivo) throw abortar(motivo, true);
    if (digitalDaCarta(carta, d.comentarios) !== digitalAntes) throw abortar('a carta mudou desde o retrato');
    let descricaoNova = null;
    if (mudanca.tipo === 'trecho' || mudanca.tipo === 'anexar') {
      try { descricaoNova = novaDescricao(carta.description_html, mudanca); } catch (e) { throw abortar(e.message); }
    }
    const humano = violaAtoHumano(carta, mudanca, { atividades: d.atividades, estados: this.j.estados, novaDescricao: descricaoNova, comentarios: d.comentarios });
    if (humano) throw abortar(humano);
    // J58: o universo é toda carta aberta do projeto mais as que esperam por esta, de qualquer
    // projeto do catálogo (o motivoIntocavel já recusou relação fora da leitura).
    const relacoesPorId = new Map([[cartaId, d.relacoes]]);
    const universo = new Map(cartas.filter(c => !TERMINAIS.includes(c.state?.group)).map(c => [c.id, c]));
    for (const r of reversas(d.relacoes)) universo.set(r, porId.get(r));
    universo.set(cartaId, carta);
    for (const [id, c] of universo) {
      if (relacoesPorId.has(id)) continue;
      // B10: relação ilegível não entra como "ilegível nos dois lados", que esconderia a mudança.
      try { relacoesPorId.set(id, await this.j.consultar(`/projects/${c.projetoId}/work-items/${id}/relations/`)); }
      catch { throw abortar(`relações ilegíveis de ${identificadorDe(c)}; a prontidão não pode ser simulada`); }
    }
    const antes = prontidaoDoProjeto([...universo.values()], relacoesPorId, porId);
    const copia = aplicarNaCopia(carta, mudanca, { descricaoNova, estados: this.j.estados });
    const porIdDepois = new Map(porId); porIdDepois.set(cartaId, copia);
    const depois = prontidaoDoProjeto([...universo.values()].map(c => (c.id === cartaId ? copia : c)), relacoesPorId, porIdDepois);
    const prontidao = violaProntidao(antes, depois, cartaId);
    if (prontidao) throw abortar(prontidao);
    return { carta, descricaoNova };
  }

  // Comentário (intenção ou recibo): só o POST vai sob a trava, com o fencing do lease (J53, B19).
  comentarSobFencing(cartaId, html, externalId) {
    return this.j.escritor.comentar({ projetoId: this.projetoId, cartaId, html, externalId, sobTrava: acao => this.j.sobFencing(acao) });
  }

  async aplicar(v) {
    const carta = this.j.r.porIdentificador.get(v.identificador);
    const digitalAntes = this.j.r.digitais.get(carta.id);
    let conferida;
    try { conferida = await this.conferirAoVivo(carta.id, v.mudanca, digitalAntes); }
    catch (erro) { if (erro.abortar) return { resultado: 'MANTER', motivo: erro.message }; throw erro; }
    const tentativa = randomUUID();
    const chave = chaveDaMudanca(carta.id, v.mudanca, digitalAntes, tentativa);
    const html = htmlIntencao({ veredito: v.veredito, chave, comentario: v.comentario, evidencias: v.evidencias, mudanca: v.mudanca });
    const pendente = { chave, tentativa, projetoId: this.projetoId, cartaId: carta.id, carta: v.identificador, veredito: v.veredito, mudanca: v.mudanca,
      digitalAntes, descricaoNova: conferida.descricaoNova, jobId: this.j.jobId };
    await this.j.diario.marcarPendente(pendente);
    await this.comentarSobFencing(carta.id, html, chave);
    return this.efetivar(pendente);
  }

  // B17: a divergência fica no índice e o play suspenso antes de qualquer recibo.
  async suspenderPorDivergencia(p) {
    await this.j.diario.marcarDivergente(p.chave);
    await this.j.comTrava(() => this.j.play.suspenderSobTrava(p.projetoId, `divergência na verificação de ${p.carta}`));
  }

  // Recibo (ou só o diário, quando a carta ficou intocável) e RESOLVIDO.
  async fechar(p, resultado, motivo, { soDiario = false, reconciliado = null } = {}) {
    if (!soDiario) await this.comentarSobFencing(p.cartaId, htmlRecibo({ chave: p.chave, resultado, motivo }), `${p.chave}:recibo:${resultado}`);
    await this.j.diario.resolver(p.chave, resultado, { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, veredito: p.veredito,
      ...(motivo ? { motivo } : {}), ...(soDiario ? { reciboNoPlane: false } : {}), ...(reconciliado ? { reconciliado: true } : {}) });
    return { resultado, motivo, ...(reconciliado ? { reconciliado } : {}) };
  }

  // Passo 4 em diante. Também é o rolar-para-frente da reconciliação.
  async efetivar(p) {
    const { estado, escritor } = this.j;
    let resultado;
    let motivo = null;
    let intocavel = false;
    try {
      const r = await escritor.mudar({ projetoId: p.projetoId, cartaId: p.cartaId, mudanca: p.mudanca, descricaoNova: p.descricaoNova,
        conferirAntes: async (cartaLida, comentarios) => {
          if (digitalDaCarta(cartaLida, comentarios) !== p.digitalAntes) throw abortar('a carta mudou entre a intenção e a mudança');
        },
        // J64: o despacho reserva sob esta mesma trava; aqui nenhum dos dois cruza o outro.
        sobTrava: acao => this.j.sobFencing(async () => {
          if (await estado.lerLease(p.cartaId).catch(() => ({ ilegivel: true }))) throw abortar('lease de despacho apareceu na carta', true);
          const historico = await estado.lerHistorico(p.cartaId).catch(() => null);
          if (!historico || historico.some(e => e.tipo === 'TENTATIVA' && this.j.agora() - Date.parse(e.quando) < DIA_MS)) throw abortar('tentativa de despacho na carta', true);
          return acao();
        }) });
      resultado = r.conferiu ? 'APLICADO' : 'DIVERGENTE';
      if (!r.conferiu) motivo = 'a releitura não conferiu; play do projeto suspenso';
    } catch (erro) {
      // B13: play desligado (ou suspenso) entre a intenção e a mudança — a mudança não sai.
      if (erro.escopo) { resultado = 'ABORTADO'; motivo = 'play desligado no meio da sequência; a mudança não saiu'; }
      else if (!erro.abortar) throw erro;
      else { resultado = 'ABORTADO'; motivo = erro.message; intocavel = erro.intocavel; }
    }
    if (resultado === 'DIVERGENTE') await this.suspenderPorDivergencia(p);
    return this.fechar(p, resultado, motivo, { soDiario: intocavel });
  }

  // B14: apagada ou arquivada. Fora da listagem mas legível e ativa não é "sumiu": lança.
  async cartaSumiu(p, listada) {
    if (listada?.archived_at) return true;
    let detalhe;
    try { detalhe = await this.j.consultar(`/projects/${p.projetoId}/work-items/${p.cartaId}/`); }
    catch (e) { if (/HTTP 404\b/.test(e.message)) return true; throw e; }
    if (detalhe?.archived_at) return true;
    throw new Error('carta fora da listagem do projeto, mas legível; reconciliação adiada');
  }

  // J62: o PENDENTE deste projeto que um job anterior deixou. `soRecibos`: play desligado (B13).
  async reconciliar(p, { soRecibos = false } = {}) {
    const { diario } = this.j;
    const meta = { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, reconciliado: true };
    const resolverSo = async (resultado, motivo) => { await diario.resolver(p.chave, resultado, meta); return { resultado, reconciliado: motivo }; };
    if (!mudancaNaListaFechada(p.mudanca)) return resolverSo('FORA_DA_LISTA', 'mudança do índice fora da lista fechada; nada escrito');
    const { porId } = await this.j.retrato.cartasDoProjeto(this.j.projeto);
    const carta = porId.get(p.cartaId);
    if (!carta || carta.archived_at) { await this.cartaSumiu(p, carta); return resolverSo('CARTA_SUMIU', 'carta apagada ou arquivada; resolvido só no diário'); }
    const doZelador = (await listar(this.j.consultar, `/projects/${p.projetoId}/work-items/${p.cartaId}/comments/`))
      .filter(c => ehZelador(c) && c.external_source === ORIGEM_ZELADOR);
    const gravados = [...new Set(doZelador.map(c => resultadoDoRecibo(c, p.chave)).filter(Boolean))];
    if (gravados.length > 1) throw new Error('recibos conflitantes para a mesma chave; conferir a carta');
    if (gravados.length) {
      if (gravados[0] === 'DIVERGENTE') await this.j.comTrava(() => this.j.play.suspenderSobTrava(p.projetoId, `divergência na verificação de ${p.carta}`));
      return resolverSo(gravados[0], 'recibo já gravado');
    }
    const intencao = doZelador.find(c => c.external_id === p.chave);
    if (!intencao) return resolverSo('ABORTADO_SEM_ESCRITA', 'a intenção não chegou ao Plane');
    if (p.divergente) {
      await this.j.comTrava(() => this.j.play.suspenderSobTrava(p.projetoId, `divergência na verificação de ${p.carta}`));
      return this.fechar(p, 'DIVERGENTE', 'a releitura não conferiu; play do projeto suspenso', { reconciliado: 'divergência marcada no índice' });
    }
    if (jaAplicada(carta, p.mudanca, p.descricaoNova)) return this.fechar(p, 'APLICADO', null, { reconciliado: 'mudança já estava feita' });
    const atividades = await listar(this.j.consultar, `/projects/${p.projetoId}/work-items/${p.cartaId}/activities/`);
    if (zeladorAplicou(atividades, p.mudanca, { estados: this.j.estados, descricaoNova: p.descricaoNova, desde: Date.parse(intencao.created_at) })) {
      return this.fechar(p, 'DESFEITO', null, { reconciliado: 'aplicada e desfeita por outro ator' });
    }
    if (soRecibos) {
      const { motivo } = await this.motivoAgora(carta, porId);
      return this.fechar(p, 'ABORTADO', 'play desligado: a sequência não segue', { soDiario: Boolean(motivo), reconciliado: 'play desligado' });
    }
    try { await this.conferirAoVivo(p.cartaId, p.mudanca, p.digitalAntes); }
    catch (erro) {
      if (!erro.abortar) throw erro;
      return this.fechar(p, 'ABORTADO', erro.message, { soDiario: erro.intocavel, reconciliado: erro.message });
    }
    return { ...(await this.efetivar(p)), reconciliado: 'rolou para a frente' };
  }
}
