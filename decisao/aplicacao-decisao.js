// A ordem de escrita do confirmar e da retomada, sob a trava global da orquestração: releitura e digital, diário PENDENTE, comentário de intenção, PATCH da leitura ± delta, verificação, recibo, CONCLUÍDA. Não valida a prosa nem monta o pedido.
//
// Revista pelo validador de invariantes (28/10/2026, 23 janelas; docs/plano-mesa-de-decisao.md):
// - antes do comentário nada sai deste processo: toda falha é recusa limpa (`semEscrita`);
// - o comentário DECISAO/v1 é o ponto de compromisso: timeout nele não segue, fica PENDENTE;
// - o PATCH parte da releitura feita DEPOIS do comentário (labels e estado, nunca o
//   `updated_at`), e quem decide o resultado é a releitura de verificação, não a resposta;
// - a trava é a única da orquestração e quem espera desiste em ~60 s: um teto de tempo vale
//   para o lote inteiro de chamadas, e nada aqui roda CLI.
// Resíduo declarado (docs/invariants.md §6): entre a última releitura e o PATCH há uma janela
// de milissegundos que o Plane v1 não fecha contra escritores de fora do painel; as atividades
// lidas depois só a tornam visível (resultado "divergente").
import { codificarRecibo, FONTE } from './protocolo-decisao.js';
import { calcularDelta, corpoDoPatch, digital, mesmoDelta, resolver, verificar } from './efeitos.js';

const TETO_MS = 40_000;
const semEscrita = (mensagem, status) => Object.assign(new Error(mensagem), { semEscrita: true, status });
const idDe = x => (x && typeof x === 'object' ? x.id : x);
const alvoDe = reg => ({ identificador: reg.identificador, sigla: reg.sigla, numero: reg.numero,
  projeto: { projetoId: reg.projetoId, pasta: reg.pasta } });
const mensagem = e => (e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'o Plane não respondeu a tempo' : e?.message ?? 'falha');

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

  async function depoisDoComentario(reg, comentarioId, sinal) {
    const alvo = alvoDe(reg);
    const notas = [];
    const inicio = agora();
    const antes = await leitor.reler(alvo, reg.cartaId, { sinal });
    let patch = { corpo: {}, labelsEsperadas: antes.carta.labels.map(l => l.id) };
    let falhaPatch = null;
    try { patch = corpoDoPatch(antes, reg.delta, resolver(antes, reg.delta)); } catch (e) { falhaPatch = e.message; }
    if (!falhaPatch && Object.keys(patch.corpo).length) {
      try { await escritor.aplicar({ projetoId: reg.projetoId, cartaId: reg.cartaId, corpo: patch.corpo, sinal }); }
      catch (e) { falhaPatch = e.http || e.semEscrita ? e.message : 'o PATCH não respondeu (tempo ou rede)'; }
    }
    const depois = await leitor.reler(alvo, reg.cartaId, { sinal });
    const v = verificar(depois, reg.delta, patch.labelsEsperadas);
    let { resultado } = v;
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
    const recibo = await escritor.comentar({ projetoId: reg.projetoId, cartaId: reg.cartaId, externalId: `${reg.chave}:aplicacao`, sinal,
      html: codificarRecibo({ identificador: reg.identificador, resultado, mudancas: v.mudancas, notas, quando: agora() }) });
    const fim = { tipo: 'DECISAO_CONCLUIDA', chave: reg.chave, resultado, reciboId: recibo.id, mudancas: v.mudancas, notas, falhaPatch };
    await diario.anotar(fim);
    limparCache();
    return { identificador: reg.identificador, resultado, comentarioId, reciboId: recibo.id, mudancas: v.mudancas, notas };
  }

  async function depoisDoPendente(reg, sinal) {
    let comentario;
    try { comentario = await escritor.comentar({ projetoId: reg.projetoId, cartaId: reg.cartaId, html: reg.html, externalId: reg.chave, sinal }); }
    catch (e) {
      // Recusa explícita do Plane (4xx que não é o 409 da idempotência) não gravou nada: fecha a pendência.
      if (e.semEscrita || (e.http >= 400 && e.http < 500 && e.http !== 409)) {
        await diario.anotar({ tipo: 'DECISAO_ABANDONADA', chave: reg.chave, motivo: e.message }).catch(() => {});
        throw semEscrita(e.message);
      }
      throw new Error('comentário de intenção sem confirmação do Plane; nada mais foi feito — retome pela aba Decisões');
    }
    await diario.anotar({ tipo: 'COMENTARIO_GRAVADO', chave: reg.chave, comentarioId: comentario.id });
    return depoisDoComentario(reg, comentario.id, sinal);
  }

  // `g` é o guardado do preparar (com a chave de idempotência do desafio).
  function confirmar(g, identidade) {
    return sobTrava(async () => {
      const sinal = AbortSignal.timeout(tetoMs);
      const alvo = alvoDe(g);
      try {
        if (await diario.daChave(g.chaveIdempotencia)) throw semEscrita('chave de idempotência já usada', 409);
        const outra = (await diario.pendentes()).find(p => p.cartaId === g.cartaId);
        if (outra) throw semEscrita('há aplicação pendente desta carta; retome-a antes', 409);
        await escritor.conferirIdentidade({ sinal });
        const r = await leitor.reler(alvo, g.cartaId, { sinal });
        if (digital(r) !== g.digital) throw semEscrita('a carta mudou desde o preparar; prepare de novo', 409);
        if (await leaseAtivo(g.cartaId)) throw semEscrita('a carta tem execução da orquestração em curso (lease ativo)', 409);
        const delta = calcularDelta(r, g.pedido, { decisao: g.decisao, quando: g.quando });
        if (!mesmoDelta(delta, g.delta)) throw semEscrita('o efeito mudou desde o preparar; prepare de novo', 409);
        resolver(r, delta);
      } catch (e) { throw e.semEscrita ? e : semEscrita(mensagem(e), e.status); }
      const reg = { tipo: 'DECISAO_PENDENTE', chave: g.chaveIdempotencia, identificador: g.identificador, sigla: g.sigla, numero: g.numero,
        projetoId: g.projetoId, pasta: g.pasta, cartaId: g.cartaId, quem: identidade.usuarioId, decisao: g.decisao, motivo: g.motivo,
        pedido: g.pedido, delta: g.delta, html: g.html, digital: g.digital };
      try { await diario.anotar(reg); } catch { throw semEscrita('diário da mesa indisponível', 503); }
      return depoisDoPendente(reg, sinal);
    });
  }

  // Recomeça do ponto do diário, com a MESMA chave: o 409 do Plane e o diário evitam repetir.
  function retomar(chave) {
    return sobTrava(async () => {
      const sinal = AbortSignal.timeout(tetoMs);
      const x = await diario.daChave(chave);
      if (!x?.abertura) throw semEscrita('aplicação pendente não encontrada', 404);
      const reg = x.abertura;
      if (x.fim) return { identificador: reg.identificador, resultado: x.fim.resultado ?? 'abandonada', duplicado: true,
        reciboId: x.fim.reciboId ?? null, mudancas: x.fim.mudancas ?? [], notas: x.fim.notas ?? [x.fim.motivo].filter(Boolean) };
      try { await escritor.conferirIdentidade({ sinal }); } catch (e) { throw semEscrita(mensagem(e), 503); }
      if (x.comentarioId) return depoisDoComentario(reg, x.comentarioId, sinal);
      let r;
      try { r = await leitor.reler(alvoDe(reg), reg.cartaId, { sinal }); } catch (e) { throw semEscrita(mensagem(e)); }
      const proprio = r.comentarios.find(c => c.external_source === FONTE && c.external_id === chave && idDe(c.actor ?? c.created_by) === escritor.autor);
      if (proprio) {
        await diario.anotar({ tipo: 'COMENTARIO_GRAVADO', chave, comentarioId: proprio.id });
        return depoisDoComentario(reg, proprio.id, sinal);
      }
      if (digital(r, { proprias: [chave, `${chave}:aplicacao`] }) !== reg.digital || await leaseAtivo(reg.cartaId)) {
        const motivo = 'a carta mudou (ou tem lease) e o comentário não chegou: nada foi gravado; prepare de novo';
        await diario.anotar({ tipo: 'DECISAO_ABANDONADA', chave, motivo });
        return { identificador: reg.identificador, resultado: 'abandonada', reciboId: null, mudancas: [], notas: [motivo] };
      }
      return depoisDoPendente(reg, sinal);
    });
  }

  return { confirmar, retomar, leaseAtivo };
}
