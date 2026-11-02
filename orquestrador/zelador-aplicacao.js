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
// ator (recibo DESFEITO, B16), play desligado (só recibo), ou rola para a frente com as mesmas checagens
// e a descrição recalculada igual à do PENDENTE (D11). O preparo do PRONTA (PAINEL-62) nunca rola
// para a frente: fecha APLICADO, DESFEITO ou ABORTADO; sob a trava ele relê também as relações.
import { randomUUID } from 'node:crypto';
import { digitalDaCarta, ehZelador, motivoIntocavel, nomesDe, prontidaoDoProjeto, reversas, violaAtoHumano, violaProntidao } from './zelador-politica.js';
import { RESULTADOS_RECIBO, chaveDaMudanca, htmlIntencao, htmlRecibo, mesmoTexto, mudancaNaListaFechada, novaDescricao } from './zelador-veredito.js';
import { ORIGEM_ZELADOR } from './escritor-zelador-plane.js';
import { listar } from './zelador-retrato.js';
import { COMENTARIO_PREPARO, assinaturaRelacoes, estadoAlvoDoPreparo, motivoContraOPronta, siglasDoCatalogo } from './zelador-preparo.js';

const DIA_MS = 24 * 60 * 60_000;
const TERMINAIS = ['completed', 'cancelled', 'canceled'];
const GRUPOS = { completed: ['completed'], cancelled: ['cancelled', 'canceled'] };
const MUDA_DESCRICAO = m => m.tipo === 'trecho' || m.tipo === 'anexar' || (m.tipo === 'preparo' && m.declarar);
// `intocavel`: a carta ficou fora do alcance do zelador; o fechamento não escreve nela (B4).
const abortar = (motivo, intocavel = false) => Object.assign(new Error(motivo), { abortar: true, intocavel });
const identificadorDe = c => `${c.sigla}-${c.sequence_id}`;

// A carta depois da mudança, para a prontidão simulada.
function aplicarNaCopia(carta, mudanca, { descricaoNova, estados }) {
  const copia = { ...carta, labels: [...(carta.labels ?? [])] };
  if (mudanca.tipo === 'preparo') {
    if (mudanca.estado) {
      const { estado, erro } = estadoAlvoDoPreparo(estados);
      if (erro) throw abortar(erro);
      copia.state = { id: estado.id, name: estado.name, group: estado.group };
    }
    if (mudanca.declarar) copia.description_html = descricaoNova;
  } else if (mudanca.tipo === 'estado') {
    const alvo = estados.find(e => GRUPOS[mudanca.grupo].includes(e.group)) ?? { id: 'simulado', name: mudanca.grupo, group: mudanca.grupo };
    copia.state = { id: alvo.id, name: alvo.name, group: alvo.group };
  } else if (mudanca.tipo === 'labels') {
    copia.labels = [...copia.labels.filter(l => !mudanca.remover.includes(l.name)), ...mudanca.adicionar.map(name => ({ id: `nova-${name}`, name }))];
  } else copia.description_html = descricaoNova;
  return copia;
}

// J9 da correção: o estado do preparo só conta como feito no id do alvo resolvido, nunca em qualquer unstarted.
const idDoAlvo = estados => estadoAlvoDoPreparo(estados).estado?.id ?? null;

function jaAplicada(carta, mudanca, descricaoNova, estados = []) {
  if (mudanca.tipo === 'preparo') {
    const alvo = mudanca.estado ? idDoAlvo(estados) : null;
    return (!mudanca.estado || (alvo !== null && (carta.state?.id ?? carta.state) === alvo)) && (!mudanca.declarar || mesmoTexto(carta.description_html, descricaoNova));
  }
  if (mudanca.tipo === 'estado') return GRUPOS[mudanca.grupo].includes(carta.state?.group);
  if (mudanca.tipo === 'labels') { const n = nomesDe(carta); return mudanca.adicionar.every(x => n.includes(x)) && mudanca.remover.every(x => !n.includes(x)); }
  return mesmoTexto(carta.description_html, descricaoNova);
}

// B16: o próprio zelador fez esta mudança depois da intenção (e outro ator a desfez depois).
function zeladorAplicou(atividades, mudanca, { estados, descricaoNova, desde }) {
  const grupo = a => estados.find(e => e.id === a.new_identifier)?.group ?? estados.find(e => e.name === a.new_value)?.group;
  return atividades.some(a => ehZelador(a) && Date.parse(a.created_at) >= desde && (
    mudanca.tipo === 'preparo' ? (mudanca.estado && a.field === 'state' && idDoAlvo(estados) !== null && a.new_identifier === idDoAlvo(estados)) || (mudanca.declarar && a.field === 'description' && mesmoTexto(a.new_value, descricaoNova))
      : mudanca.tipo === 'estado' ? a.field === 'state' && GRUPOS[mudanca.grupo].includes(grupo(a))
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
  // `prosaJulgada`: o julgamento da CLI sobre as linhas suspeitas (só o preparo o exige).
  async conferirAoVivo(cartaId, mudanca, digitalAntes, { prosaJulgada = null } = {}) {
    const { cartas, porId } = await this.j.retrato.cartasDoProjeto(this.j.projeto);
    const carta = porId.get(cartaId);
    if (!carta || carta.projetoId !== this.projetoId) throw abortar('carta sumiu do Plane', true);
    const { d, motivo } = await this.motivoAgora(carta, porId);
    if (motivo) throw abortar(motivo, true);
    if (digitalDaCarta(carta, d.comentarios) !== digitalAntes) throw abortar('a carta mudou desde o retrato');
    let descricaoNova = null;
    if (MUDA_DESCRICAO(mudanca)) {
      try { descricaoNova = novaDescricao(carta.description_html, mudanca, { agoraMs: this.j.agora() }); } catch (e) { throw abortar(e.message); }
    }
    const humano = violaAtoHumano(carta, mudanca, { atividades: d.atividades, estados: this.j.estados, novaDescricao: descricaoNova, comentarios: d.comentarios });
    if (humano) throw abortar(humano);
    const preparo = mudanca.tipo === 'preparo';
    // D6 do PAINEL-62 (janelas 13 e 14): as relações na forma do Plane, guardadas para a releitura sob a trava.
    const relacoes = preparo ? assinaturaRelacoes(d.relacoes) : null;
    if (preparo && relacoes === null) throw abortar('relações do Plane ilegíveis ou fora da forma; o preparo não sai');
    // J1: a validação das dependências acompanha toda saída do Backlog. Decisão do dono (01/11/2026):
    // o painel veta só o certo; a prosa com o vocabulário a CLI julga, linha por linha. O gate já
    // conferiu antes do juiz; aqui é de novo, na leitura que precede a escrita (uma relação nova
    // não muda a digital).
    if (preparo) {
      const contra = motivoContraOPronta({ carta, codigo: identificadorDe(carta), comentarios: d.comentarios, relacoes: d.relacoes,
        siglas: siglasDoCatalogo(porId), porId, prosaJulgada });
      if (contra) throw abortar(contra);
    }
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
    const prontidao = violaProntidao(antes, depois, cartaId, { tipo: mudanca.tipo, codigoAlvo: identificadorDe(carta) });
    if (prontidao) throw abortar(prontidao);
    // D4: a carta preparada tem de sair pronta no juiz, com as relações relidas ao vivo.
    if (preparo && !depois.get(cartaId).pronta) throw abortar(`a carta preparada não fica pronta: ${depois.get(cartaId).motivos.join('; ')}`);
    return { carta, descricaoNova, relacoes };
  }

  // Comentário (intenção ou recibo): só o POST vai sob a trava, com o fencing do lease (J53, B19).
  comentarSobFencing(cartaId, html, externalId) {
    return this.j.escritor.comentar({ projetoId: this.projetoId, cartaId, html, externalId, sobTrava: acao => this.j.sobFencing(acao) });
  }

  async aplicar(v) {
    const carta = this.j.r.porIdentificador.get(v.identificador);
    const digitalAntes = this.j.r.digitais.get(carta.id);
    let conferida;
    try { conferida = await this.conferirAoVivo(carta.id, v.mudanca, digitalAntes, { prosaJulgada: v.prosaJulgada ?? null }); }
    catch (erro) { if (erro.abortar) return { resultado: 'MANTER', motivo: erro.message }; throw erro; }
    const tentativa = randomUUID();
    const chave = chaveDaMudanca(carta.id, v.mudanca, digitalAntes, tentativa);
    const preparo = v.mudanca.tipo === 'preparo';
    const html = htmlIntencao({ veredito: v.veredito, chave, comentario: preparo ? COMENTARIO_PREPARO : v.comentario, evidencias: v.evidencias, mudanca: v.mudanca });
    const pendente = { chave, tentativa, projetoId: this.projetoId, cartaId: carta.id, carta: v.identificador, veredito: v.veredito, mudanca: v.mudanca,
      digitalAntes, descricaoNova: conferida.descricaoNova, jobId: this.j.jobId,
      // D13: o PENDENTE guarda o grupo; o id do estado é resolvido e conferido na escrita.
      ...(preparo ? { relacoes: conferida.relacoes, ...(v.mudanca.estado ? { grupoAlvo: 'unstarted' } : {}) } : {}) };
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
    let cartaVerificada = null;
    try {
      const r = await escritor.mudar({ projetoId: p.projetoId, cartaId: p.cartaId, mudanca: p.mudanca, descricaoNova: p.descricaoNova,
        conferirAntes: async (cartaLida, comentarios, relacoes) => {
          if (digitalDaCarta(cartaLida, comentarios) !== p.digitalAntes) throw abortar('a carta mudou entre a intenção e a mudança');
          // D6, janela 13: relação criada entre a simulação e o PATCH aborta, aqui, sob a trava.
          if (p.mudanca.tipo === 'preparo' && (assinaturaRelacoes(relacoes) === null || assinaturaRelacoes(relacoes) !== p.relacoes)) {
            throw abortar('as relações da carta mudaram ou ficaram ilegíveis entre a simulação e o PATCH');
          }
        },
        // J64: o despacho reserva sob esta mesma trava; aqui nenhum dos dois cruza o outro.
        sobTrava: acao => this.j.sobFencing(async () => {
          if (await estado.lerLease(p.cartaId).catch(() => ({ ilegivel: true }))) throw abortar('lease de despacho apareceu na carta', true);
          const historico = await estado.lerHistorico(p.cartaId).catch(() => null);
          if (!historico || historico.some(e => e.tipo === 'TENTATIVA' && this.j.agora() - Date.parse(e.quando) < DIA_MS)) throw abortar('tentativa de despacho na carta', true);
          // Item 9 (F4b): a sessão que reservou a carta no meio da sequência ganha dela.
          const reserva = this.j.cartaReservada ? await this.j.cartaReservada(p.cartaId).catch(() => ({ motivo: 'reservas ilegíveis' })) : null;
          if (reserva) throw abortar(`carta reservada por outra sessão: ${reserva.motivo}`, true);
          return acao();
        }) });
      resultado = r.conferiu ? 'APLICADO' : 'DIVERGENTE';
      cartaVerificada = r.carta ?? null;
      if (!r.conferiu) motivo = 'a releitura não conferiu; play do projeto suspenso';
    } catch (erro) {
      // B13: play desligado (ou suspenso) entre a intenção e a mudança — a mudança não sai.
      if (erro.escopo) { resultado = 'ABORTADO'; motivo = 'play desligado no meio da sequência; a mudança não saiu'; }
      else if (!erro.abortar) throw erro;
      else { resultado = 'ABORTADO'; motivo = erro.message; intocavel = erro.intocavel; }
    }
    if (resultado === 'DIVERGENTE') await this.suspenderPorDivergencia(p);
    const fechado = await this.fechar(p, resultado, motivo, { soDiario: intocavel });
    // D10: o gate depois do preparo usa a digital desta releitura de verificação.
    return resultado === 'APLICADO' && cartaVerificada ? { ...fechado, chave: p.chave, cartaVerificada } : fechado;
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
    if (jaAplicada(carta, p.mudanca, p.descricaoNova, this.j.estados)) return this.fechar(p, 'APLICADO', null, { reconciliado: 'mudança já estava feita' });
    const atividades = await listar(this.j.consultar, `/projects/${p.projetoId}/work-items/${p.cartaId}/activities/`);
    if (zeladorAplicou(atividades, p.mudanca, { estados: this.j.estados, descricaoNova: p.descricaoNova, desde: Date.parse(intencao.created_at) })) {
      return this.fechar(p, 'DESFEITO', null, { reconciliado: 'aplicada e desfeita por outro ator' });
    }
    if (p.mudanca.tipo === 'preparo') {
      const { motivo } = await this.motivoAgora(carta, porId);
      return this.fechar(p, 'ABORTADO', 'o preparo nunca rola para a frente; o próximo PRONTA confere tudo de novo', { soDiario: Boolean(motivo), reconciliado: 'preparo não rola para a frente' });
    }
    if (soRecibos) {
      const { motivo } = await this.motivoAgora(carta, porId);
      return this.fechar(p, 'ABORTADO', 'play desligado: a sequência não segue', { soDiario: Boolean(motivo), reconciliado: 'play desligado' });
    }
    let conferida;
    try { conferida = await this.conferirAoVivo(p.cartaId, p.mudanca, p.digitalAntes); }
    catch (erro) {
      if (!erro.abortar) throw erro;
      return this.fechar(p, 'ABORTADO', erro.message, { soDiario: erro.intocavel, reconciliado: erro.message });
    }
    // D11: o disco não dita o texto; a descrição do PENDENTE tem de ser a recalculada ao vivo.
    if ((conferida.descricaoNova ?? null) !== (p.descricaoNova ?? null)) {
      const motivo = 'a descrição gravada no PENDENTE difere da recalculada ao vivo; nada escrito';
      return this.fechar(p, 'ABORTADO', motivo, { reconciliado: motivo });
    }
    return { ...(await this.efetivar(p)), reconciliado: 'rolou para a frente' };
  }
}
