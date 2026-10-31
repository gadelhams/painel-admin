// A ordem de escrita do confirmar, da retomada e do abandono, sob a trava global da orquestração: releitura e digital, diário PENDENTE, comentário de intenção, PATCH da leitura ± delta, verificação, recibo, CONCLUÍDA. Não valida a prosa nem monta o pedido.
//
// Revista pelo validador de invariantes (28/10/2026, 23 janelas; 31/10/2026, A1–A4;
// docs/plano-mesa-de-decisao.md):
// - antes do comentário nada sai deste processo: toda falha é recusa limpa (`semEscrita`);
// - o comentário DECISAO/v1 é o ponto de compromisso: timeout nele não segue, fica PENDENTE;
//   depois dele, QUALQUER falha é "resultado incerto" — o rótulo vem da fase, não do erro;
// - o PATCH parte da releitura feita DEPOIS do comentário (labels e estado, nunca o
//   `updated_at`), e quem decide o resultado é a releitura de verificação, não a resposta;
// - uma operação = uma sessão do escritor (a chave lida e conferida uma vez);
// - a janela das atividades começa ANTES da primeira releitura sob a trava;
// - a retomada reconfere o diário e recalcula o delta contra a carta de agora
//   (retomada-decisao.js); o recibo que já está na carta manda no resultado;
// - a trava é a única da orquestração e quem espera desiste em ~60 s: um teto de tempo vale
//   para o lote inteiro de chamadas, e nada aqui roda CLI.
// Resíduo declarado (docs/invariants.md §6): entre a última releitura e o PATCH há uma janela
// de milissegundos que o Plane v1 não fecha contra escritores de fora do painel; as atividades
// lidas depois só a tornam visível (resultado "divergente"), e são de melhor esforço.
import { codificarRecibo, lerRecibo, FONTE } from './protocolo-decisao.js';
import { calcularDelta, cartaDepois, corpoDoPatch, digital, mesmoDelta, resolver, verificar } from './efeitos.js';
import { conferirRegistro, planoRetomada, recusaRetomada } from './retomada-decisao.js';

const TETO_MS = 40_000;
const semEscrita = (mensagem, status) => Object.assign(new Error(mensagem), { semEscrita: true, status });
const idDe = x => (x && typeof x === 'object' ? x.id : x);
const alvoDe = reg => ({ identificador: reg.identificador, sigla: reg.sigla, numero: reg.numero,
  projeto: { projetoId: reg.projetoId, pasta: reg.pasta } });
const mensagem = e => (e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'o Plane não respondeu a tempo' : e?.message ?? 'falha');
// Depois do comentário de intenção: erro comum (nunca `semEscrita` nem recusa com status), para a
// fronteira dizer "resultado incerto" e o desafio não sumir como se nada tivesse sido gravado.
const incerto = e => new Error(`resultado incerto: ${mensagem(e)}; retome ou abandone pela aba Decisões`);

export function criarAplicacaoDecisao({ leitor, escritor, diario, comTrava, lerLease, agora = Date.now, tetoMs = TETO_MS,
  limparCache = () => {} }) {
  // Quem não conseguiu a trava não chegou a ler nem gravar nada: recusa limpa.
  async function sobTrava(acao) {
    let entrou = false;
    try { return await comTrava(() => { entrou = true; return acao(); }); }
    catch (e) { throw entrou ? e : semEscrita('trava da orquestração ocupada; tente de novo em um minuto', 503); }
  }

  async function leaseAtivo(cartaId) {
    let lease;
    try { lease = await lerLease(cartaId); } catch { return true; } // lease ilegível conta como ativo: falha fechada
    return Boolean(lease) && Date.parse(lease.expiraEm) > agora();
  }

  const proprio = (r, chave) => r.comentarios.find(c => c.external_source === FONTE && c.external_id === chave &&
    idDe(c.actor ?? c.created_by) === escritor.autor);

  async function depoisDoComentario(reg, comentarioId, { sessao, sinal, inicio, delta, quem, retomada = false }) {
    const alvo = alvoDe(reg);
    const notas = [];
    const antes = await leitor.reler(alvo, reg.cartaId, { sinal });
    let patch = { corpo: {}, labelsEsperadas: antes.carta.labels.map(l => l.id) };
    let falhaPatch = null;
    try { patch = corpoDoPatch(antes, delta, resolver(antes, delta)); } catch (e) { falhaPatch = e.message; }
    if (!falhaPatch && Object.keys(patch.corpo).length) {
      try { await sessao.aplicar({ projetoId: reg.projetoId, cartaId: reg.cartaId, corpo: patch.corpo, sinal }); }
      catch (e) { falhaPatch = e.http || e.semEscrita ? e.message : 'o PATCH não respondeu (tempo ou rede)'; }
    }
    const depois = await leitor.reler(alvo, reg.cartaId, { sinal });
    const v = verificar(depois, delta, patch.labelsEsperadas);
    let { resultado } = v;
    let mudancas = v.mudancas;
    notas.push(...v.notas);
    if (falhaPatch) notas.push(`PATCH: ${falhaPatch}`);
    if (v.faltam.length) notas.push(`não valeu: ${v.faltam.join(', ')}`);
    try {
      const alheias = (await leitor.atividades(alvo, reg.cartaId, { sinal }))
        .filter(a => Date.parse(a.created_at) >= inicio && idDe(a.actor) && idDe(a.actor) !== escritor.autor);
      if (alheias.length) {
        notas.push(`${alheias.length} ${alheias.length === 1 ? 'alteração' : 'alterações'} de outro ator durante a aplicação`);
        if (resultado === 'aplicado' || resultado === 'só registro') resultado = 'divergente';
      }
    } catch { notas.push('atividades da carta não conferidas'); }
    const recibo = await sessao.comentar({ projetoId: reg.projetoId, cartaId: reg.cartaId, externalId: `${reg.chave}:aplicacao`, sinal,
      html: codificarRecibo({ identificador: reg.identificador, resultado, mudancas, notas, quando: agora() }) });
    // O recibo já estava na carta (409): é ele que o zelador lê, então é ele que vale.
    const gravado = recibo.repetido ? lerRecibo(recibo.html) : null;
    let notasFinais = notas;
    if (gravado) ({ resultado, mudancas, notas: notasFinais } = gravado);
    const fim = { tipo: 'DECISAO_CONCLUIDA', chave: reg.chave, resultado, reciboId: recibo.id, mudancas, notas: notasFinais, falhaPatch,
      quem, ...(retomada ? { retomada: true } : {}) };
    await diario.anotar(fim);
    limparCache();
    return { identificador: reg.identificador, resultado, comentarioId, reciboId: recibo.id, mudancas, notas: notasFinais };
  }

  const seguir = (...args) => depoisDoComentario(...args).catch(e => { throw incerto(e); });

  async function depoisDoPendente(reg, ctx) {
    let comentario;
    try { comentario = await ctx.sessao.comentar({ projetoId: reg.projetoId, cartaId: reg.cartaId, html: reg.html, externalId: reg.chave, sinal: ctx.sinal }); }
    catch (e) {
      // Recusa explícita do Plane (4xx que não é o 409 da idempotência) não gravou nada: fecha a pendência.
      if (e.semEscrita || (e.http >= 400 && e.http < 500 && e.http !== 409)) {
        await diario.anotar({ tipo: 'DECISAO_ABANDONADA', chave: reg.chave, motivo: e.message, quem: ctx.quem }).catch(() => {});
        throw semEscrita(e.message);
      }
      throw new Error('comentário de intenção sem confirmação do Plane; nada mais foi feito — retome pela aba Decisões');
    }
    try { await diario.anotar({ tipo: 'COMENTARIO_GRAVADO', chave: reg.chave, comentarioId: comentario.id }); }
    catch (e) { throw incerto(e); }
    return seguir(reg, comentario.id, ctx);
  }

  // `g` é o guardado do preparar (com a chave de idempotência do desafio).
  function confirmar(g, identidade) {
    return sobTrava(async () => {
      const sinal = AbortSignal.timeout(tetoMs);
      const alvo = alvoDe(g);
      let sessao;
      let digitalAplicada;
      const inicio = agora();
      try {
        if (await diario.daChave(g.chaveIdempotencia)) throw semEscrita('chave de idempotência já usada', 409);
        const outra = (await diario.pendentes()).find(p => p.cartaId === g.cartaId);
        if (outra) throw semEscrita('há aplicação pendente desta carta; retome-a ou abandone-a antes', 409);
        sessao = await escritor.abrir({ sinal });
        const r = await leitor.reler(alvo, g.cartaId, { sinal });
        if (digital(r) !== g.digital) throw semEscrita('a carta mudou desde o preparar; prepare de novo', 409);
        if (await leaseAtivo(g.cartaId)) throw semEscrita('a carta tem execução da orquestração em curso (lease ativo)', 409);
        const delta = calcularDelta(r, g.pedido, { decisao: g.decisao, quando: g.quando });
        if (!mesmoDelta(delta, g.delta)) throw semEscrita('o efeito mudou desde o preparar; prepare de novo', 409);
        const { corpo } = corpoDoPatch(r, delta, resolver(r, delta));
        const proprias = [g.chaveIdempotencia, `${g.chaveIdempotencia}:aplicacao`];
        digitalAplicada = digital(cartaDepois(r, corpo), { proprias, textoDescricao: true });
      } catch (e) { throw e.semEscrita ? e : semEscrita(mensagem(e), e.status); }
      const reg = { tipo: 'DECISAO_PENDENTE', chave: g.chaveIdempotencia, identificador: g.identificador, sigla: g.sigla, numero: g.numero,
        projetoId: g.projetoId, pasta: g.pasta, cartaId: g.cartaId, quem: identidade.usuarioId, decisao: g.decisao, motivo: g.motivo,
        pedido: g.pedido, delta: g.delta, html: g.html, digital: g.digital, digitalAplicada, quandoDecisao: g.quando };
      try { await diario.anotar(reg); } catch { throw semEscrita('diário da mesa indisponível', 503); }
      return depoisDoPendente(reg, { sessao, sinal, inicio, delta: g.delta, quem: identidade.usuarioId });
    });
  }

  const duplicado = (reg, fim) => ({ identificador: reg.identificador, resultado: fim.resultado ?? 'abandonada', duplicado: true,
    reciboId: fim.reciboId ?? null, mudancas: fim.mudancas ?? [], notas: fim.notas ?? [fim.motivo].filter(Boolean) });

  // Recomeça do ponto do diário, com a MESMA chave: o 409 do Plane e o diário evitam repetir.
  function retomar(chave, identidade = {}) {
    return sobTrava(async () => {
      const sinal = AbortSignal.timeout(tetoMs);
      const x = await diario.daChave(chave);
      if (!x?.abertura) throw semEscrita('aplicação pendente não encontrada', 404);
      const reg = x.abertura;
      if (x.fim) return duplicado(reg, x.fim);
      conferirRegistro(reg);
      const quem = identidade.usuarioId ?? null;
      let sessao;
      try { sessao = await escritor.abrir({ sinal }); } catch (e) { throw semEscrita(mensagem(e), 503); }
      const inicio = agora();
      let r;
      try { r = await leitor.reler(alvoDe(reg), reg.cartaId, { sinal }); } catch (e) { throw semEscrita(mensagem(e), e.status); }
      const plano = planoRetomada(reg, r, { agora: agora(), leaseAtivo: await leaseAtivo(reg.cartaId) });
      const ctx = { sessao, sinal, inicio, delta: plano.delta, quem, retomada: true };
      const meu = x.comentarioId ?? proprio(r, chave)?.id;
      if (meu) {
        if (!plano.ok) throw recusaRetomada(plano.motivo);
        if (!x.comentarioId) await diario.anotar({ tipo: 'COMENTARIO_GRAVADO', chave, comentarioId: meu });
        return seguir(reg, meu, ctx);
      }
      if (!plano.ok || plano.fase !== 'original') {
        const motivo = `${plano.motivo ?? 'a carta mudou'} e o comentário não chegou: nada foi gravado; prepare de novo`;
        await diario.anotar({ tipo: 'DECISAO_ABANDONADA', chave, motivo, quem });
        return { identificador: reg.identificador, resultado: 'abandonada', reciboId: null, mudancas: [], notas: [motivo] };
      }
      return depoisDoPendente(reg, ctx);
    });
  }

  // Fecha a pendência sem aplicar mais nada. O recibo "abandonada" na carta é de melhor esforço
  // (carta 404, projeto congelado, Plane fora): o que fecha é o registro no diário.
  function abandonar(chave, identidade = {}) {
    return sobTrava(async () => {
      const sinal = AbortSignal.timeout(tetoMs);
      const x = await diario.daChave(chave);
      if (!x?.abertura) throw semEscrita('aplicação pendente não encontrada', 404);
      const reg = x.abertura;
      if (x.fim) return duplicado(reg, x.fim);
      const quem = identidade.usuarioId ?? null;
      const notas = [];
      let reciboId = null;
      let jaGravado = null;
      try {
        const sessao = await escritor.abrir({ sinal });
        const r = await leitor.reler(alvoDe(reg), reg.cartaId, { sinal });
        if (proprio(r, chave)) {
          const recibo = await sessao.comentar({ projetoId: reg.projetoId, cartaId: reg.cartaId, externalId: `${chave}:aplicacao`, sinal,
            html: codificarRecibo({ identificador: reg.identificador, resultado: 'abandonada', mudancas: [],
              notas: ['pendência abandonada pelo dono no painel; nada mais foi aplicado'], quando: agora() }) });
          reciboId = recibo.id;
          jaGravado = recibo.repetido ? lerRecibo(recibo.html) : null;
        } else notas.push('o comentário DECISAO/v1 não está na carta: nenhum recibo a gravar');
      } catch (e) { notas.push(`recibo de abandono não gravado no Plane (${mensagem(e)})`); }
      // Recibo de aplicação que já estava na carta: a decisão tinha concluído lá; fecha com ele.
      if (jaGravado && jaGravado.resultado !== 'abandonada') {
        const fim = { tipo: 'DECISAO_CONCLUIDA', chave, resultado: jaGravado.resultado, reciboId, mudancas: jaGravado.mudancas,
          notas: [...jaGravado.notas, 'o recibo já estava na carta: a pendência fecha com o resultado dele'], quem };
        await diario.anotar(fim).catch(e => { throw incerto(e); });
        limparCache();
        return { identificador: reg.identificador, resultado: fim.resultado, reciboId, mudancas: fim.mudancas, notas: fim.notas };
      }
      const fim = { tipo: 'DECISAO_ABANDONADA', chave, motivo: 'abandonada pelo dono', quem, reciboId, notas };
      try { await diario.anotar(fim); } catch (e) { throw reciboId ? incerto(e) : semEscrita('diário da mesa indisponível', 503); }
      limparCache();
      return { identificador: reg.identificador, resultado: 'abandonada', reciboId, mudancas: [], notas };
    });
  }

  return { confirmar, retomar, abandonar, leaseAtivo };
}
