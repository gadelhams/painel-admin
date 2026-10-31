// Escritor da mesa de decisão no Plane com a identidade Painel Admin: comentário da mesa e o PATCH da lista fechada. Lê a chave do arquivo uma vez por operação; não decide o que gravar.
//
// O Painel Admin é ADMIN do workspace: a única proteção é o que este módulo aceita. Por
// isso a chave nunca entra em `process.env` nem em log: mora num arquivo 600 do dono do
// processo (`~/.config/plane/painel-admin.token`), aberto com O_NOFOLLOW e conferido pelo
// descritor aberto. `abrir()` é UMA operação: lê a chave uma vez, confere `/users/me` contra o
// UUID fixo de `PLANE_ADMIN_ACTOR_ID` com ela e a mesma cópia serve a todas as chamadas da
// operação (trocar o arquivo no meio não muda quem escreve). Nenhum pedido segue
// redirecionamento: a chave não sai para outro endereço. Comentário só no formato da mesa
// (`external_source: painel-decisao-v1`, `external_id` = a chave da decisão, sem prefixo de
// outro protocolo fora do cabeçalho); PATCH só com labels, estado e descrição — quem calcula o
// valor é efeitos.js.
import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ANYA_PLANE_ID, CKBL_PLANE_ID } from './permissao.js';
import { FONTE, conferirComentarioMesa } from './protocolo-decisao.js';

const ARQUIVO_CHAVE_PADRAO = path.join(os.homedir(), '.config', 'plane', 'painel-admin.token');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXTERNO = /^[0-9a-f-]{36}(?::aplicacao)?$/i;
const CAMPOS_PATCH = new Set(['labels', 'state', 'description_html']);

// `semEscrita`: provadamente nada saiu deste processo para o Plane. `http`: o status que o Plane deu.
const falha = (mensagem, extra = {}) => Object.assign(new Error(mensagem), extra);
const idDe = x => (x && typeof x === 'object' ? x.id : x);

export function criarEscritorDecisaoPlane({ autorEsperado, projetosPermitidos, arquivoChave = ARQUIVO_CHAVE_PADRAO,
  apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch, timeoutMs = 10_000,
  uid = process.getuid?.() } = {}) {
  if (!UUID.test(autorEsperado ?? '')) throw new Error('PLANE_ADMIN_ACTOR_ID ausente ou inválido');
  const fora = new Set([ANYA_PLANE_ID, CKBL_PLANE_ID]);
  const permitidos = new Set([...(projetosPermitidos ?? [])].filter(p => UUID.test(p) && !fora.has(p)));
  if (!permitidos.size) throw new Error('nenhum projeto permitido à mesa');
  const raiz = `${apiBase}/api/v1`;

  // O que se confere é o arquivo ABERTO (fstat do descritor), não o caminho: entre conferir e
  // ler, ninguém troca o arquivo por um elo ou por outro.
  async function lerChave() {
    const recusada = () => falha('chave do Painel Admin recusada: o arquivo precisa ser comum, 600 e do usuário do painel', { semEscrita: true });
    let h;
    try { h = await fs.open(arquivoChave, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
    catch (e) { throw e.code === 'ELOOP' ? recusada() : falha('chave do Painel Admin ausente', { semEscrita: true }); }
    try {
      const info = await h.stat();
      if (!info.isFile() || (info.mode & 0o077) !== 0 || (uid !== undefined && info.uid !== uid) || info.size > 1_024) throw recusada();
      const chave = (await h.readFile('utf8')).trim();
      if (!/^[\x21-\x7e]{16,512}$/.test(chave)) throw falha('chave do Painel Admin ilegível', { semEscrita: true });
      return chave;
    } finally { await h.close().catch(() => {}); }
  }

  async function pedir(chave, caminho, { method = 'GET', corpo, sinal } = {}) {
    const r = await fetchImpl(`${raiz}${caminho}`, { method, redirect: 'error',
      headers: { 'X-API-Key': chave, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(sinal ? [sinal] : [])]) });
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => null) };
  }

  function escopo(projetoId, cartaId) {
    if (fora.has(projetoId) || !permitidos.has(projetoId) || !UUID.test(cartaId ?? '')) {
      throw falha('projeto ou carta fora do escopo da mesa', { semEscrita: true });
    }
    return `/workspaces/astargne/projects/${projetoId}/work-items/${cartaId}`;
  }

  // A forma se confere antes de qualquer rede (e de novo dentro da sessão, no ponto de escrita).
  function formaComentario({ projetoId, cartaId, html, externalId }) {
    const base = escopo(projetoId, cartaId);
    if (!EXTERNO.test(externalId ?? '') || typeof html !== 'string') throw falha('comentário fora do formato da mesa', { semEscrita: true });
    try { conferirComentarioMesa(html); } catch (e) { throw falha(e.message, { semEscrita: true }); }
    return base;
  }
  function formaPatch({ projetoId, cartaId, corpo }) {
    const base = escopo(projetoId, cartaId);
    const chaves = Object.keys(corpo ?? {});
    if (!chaves.length || chaves.some(k => !CAMPOS_PATCH.has(k)) ||
        ('labels' in corpo && (!Array.isArray(corpo.labels) || corpo.labels.some(id => !UUID.test(id)))) ||
        ('state' in corpo && !UUID.test(corpo.state)) || ('description_html' in corpo && typeof corpo.description_html !== 'string')) {
      throw falha('PATCH fora da lista fechada da mesa', { semEscrita: true });
    }
    return base;
  }

  // Uma operação: a chave lida uma vez e conferida; a sessão devolvida usa só essa cópia.
  async function abrir({ sinal } = {}) {
    const chave = await lerChave();
    const me = await pedir(chave, '/users/me/', { sinal }).catch(() => null);
    if (!me?.ok) throw falha('o Plane não confirmou a identidade do Painel Admin', { semEscrita: true });
    if (me.corpo?.id !== autorEsperado) throw falha('a chave não é do Painel Admin configurado (PLANE_ADMIN_ACTOR_ID)', { semEscrita: true });

    // Idempotente por `external_id`: o 409 do Plane traz o id do comentário já gravado (no
    // PROJETO, não na carta) — relido pelo caminho da carta, ele tem de ser desta carta e da mesa.
    async function comentar({ projetoId, cartaId, html, externalId, sinal: s2 = sinal }) {
      const base = formaComentario({ projetoId, cartaId, html, externalId });
      if (html.includes(chave)) throw falha('o comentário carregaria a chave do Painel Admin', { semEscrita: true });
      const r = await pedir(chave, `${base}/comments/`, { method: 'POST', corpo: { comment_html: html, external_source: FONTE, external_id: externalId }, sinal: s2 });
      let comentario = r.corpo;
      if (r.status === 409 && UUID.test(r.corpo?.id ?? '')) {
        const relido = await pedir(chave, `${base}/comments/${r.corpo.id}/`, { sinal: s2 });
        if (!relido.ok) throw falha('external_id da mesa já usado fora desta carta', { http: relido.status });
        comentario = relido.corpo;
      } else if (!r.ok) throw falha(`Plane recusou o comentário (HTTP ${r.status})`, { http: r.status });
      if (!UUID.test(comentario?.id ?? '') || idDe(comentario.actor ?? comentario.created_by) !== autorEsperado ||
          comentario.external_source !== FONTE || comentario.external_id !== externalId) {
        throw falha('Plane não confirmou o comentário da mesa e sua autoria');
      }
      return { id: comentario.id, repetido: r.status === 409, html: String(comentario.comment_html ?? '') };
    }

    // A resposta do PATCH não decide nada (o Plane descarta label de outro projeto com 200):
    // quem decide é a releitura de verificação, feita por quem chama.
    async function aplicar({ projetoId, cartaId, corpo, sinal: s2 = sinal }) {
      const base = formaPatch({ projetoId, cartaId, corpo });
      const r = await pedir(chave, `${base}/`, { method: 'PATCH', corpo, sinal: s2 });
      if (!r.ok) throw falha(`Plane recusou a alteração (HTTP ${r.status})`, { http: r.status });
      return { status: r.status };
    }

    return { autor: autorEsperado, comentar, aplicar };
  }

  // Avulsas: cada chamada é uma operação inteira (lê a chave, confere a identidade, escreve).
  return { autor: autorEsperado, abrir,
    conferirIdentidade: async (o = {}) => { await abrir(o); },
    comentar: async (args) => { formaComentario(args); return (await abrir(args)).comentar(args); },
    aplicar: async (args) => { formaPatch(args); return (await abrir(args)).aplicar(args); } };
}
