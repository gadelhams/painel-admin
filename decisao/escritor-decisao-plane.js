// Escritor da mesa de decisão no Plane com a identidade Painel Admin: comentário da mesa e o PATCH da lista fechada. Lê a chave do arquivo a cada operação; não decide o que gravar.
//
// O Painel Admin é ADMIN do workspace: a única proteção é o que este módulo aceita. Por
// isso a chave nunca entra em `process.env` nem em log: mora num arquivo 600 do dono do
// processo (`~/.config/plane/painel-admin.token`), relido a cada chamada, e antes de toda
// escrita `/users/me` tem de ser o UUID fixo de `PLANE_ADMIN_ACTOR_ID`. Comentário só no
// formato da mesa (`external_source: painel-decisao-v1`, `external_id` = a chave da
// decisão); PATCH só com labels, estado e descrição — quem calcula o valor é efeitos.js.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ANYA_PLANE_ID } from './permissao.js';
import { FONTE, CABECALHO, CABECALHO_RECIBO } from './protocolo-decisao.js';

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
  const permitidos = new Set([...(projetosPermitidos ?? [])].filter(p => UUID.test(p) && p !== ANYA_PLANE_ID));
  if (!permitidos.size) throw new Error('nenhum projeto permitido à mesa');
  const raiz = `${apiBase}/api/v1`;

  async function lerChave() {
    let info;
    try { info = await fs.lstat(arquivoChave); } catch { throw falha('chave do Painel Admin ausente', { semEscrita: true }); }
    if (!info.isFile() || (info.mode & 0o077) !== 0 || (uid !== undefined && info.uid !== uid) || info.size > 1_024) {
      throw falha('chave do Painel Admin recusada: o arquivo precisa ser comum, 600 e do usuário do painel', { semEscrita: true });
    }
    const chave = (await fs.readFile(arquivoChave, 'utf8')).trim();
    if (!/^[\x21-\x7e]{16,512}$/.test(chave)) throw falha('chave do Painel Admin ilegível', { semEscrita: true });
    return chave;
  }

  async function pedir(chave, caminho, { method = 'GET', corpo, sinal } = {}) {
    const r = await fetchImpl(`${raiz}${caminho}`, { method,
      headers: { 'X-API-Key': chave, ...(corpo ? { 'content-type': 'application/json' } : {}) },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(sinal ? [sinal] : [])]) });
    return { status: r.status, ok: r.ok, corpo: await r.json().catch(() => null) };
  }

  function escopo(projetoId, cartaId) {
    if (projetoId === ANYA_PLANE_ID || !permitidos.has(projetoId) || !UUID.test(cartaId ?? '')) {
      throw falha('projeto ou carta fora do escopo da mesa', { semEscrita: true });
    }
    return `/workspaces/astargne/projects/${projetoId}/work-items/${cartaId}`;
  }

  async function conferirIdentidade({ sinal } = {}) {
    const chave = await lerChave();
    const me = await pedir(chave, '/users/me/', { sinal }).catch(() => null);
    if (!me?.ok) throw falha('o Plane não confirmou a identidade do Painel Admin', { semEscrita: true });
    if (me.corpo?.id !== autorEsperado) throw falha('a chave não é do Painel Admin configurado (PLANE_ADMIN_ACTOR_ID)', { semEscrita: true });
  }

  // Idempotente por `external_id`: o 409 do Plane traz o id do comentário já gravado (no
  // PROJETO, não na carta) — relido pelo caminho da carta, ele tem de ser desta carta e da mesa.
  async function comentar({ projetoId, cartaId, html, externalId, sinal }) {
    const base = escopo(projetoId, cartaId);
    if (!EXTERNO.test(externalId ?? '') || typeof html !== 'string' ||
        !(html.startsWith(`<p><strong>${CABECALHO}</strong>`) || html.startsWith(`<p><strong>${CABECALHO_RECIBO}</strong>`))) {
      throw falha('comentário fora do formato da mesa', { semEscrita: true });
    }
    const chave = await lerChave();
    if (html.includes(chave)) throw falha('o comentário carregaria a chave do Painel Admin', { semEscrita: true });
    const r = await pedir(chave, `${base}/comments/`, { method: 'POST', corpo: { comment_html: html, external_source: FONTE, external_id: externalId }, sinal });
    let comentario = r.corpo;
    if (r.status === 409 && UUID.test(r.corpo?.id ?? '')) {
      const relido = await pedir(chave, `${base}/comments/${r.corpo.id}/`, { sinal });
      if (!relido.ok) throw falha('external_id da mesa já usado fora desta carta', { http: relido.status });
      comentario = relido.corpo;
    } else if (!r.ok) throw falha(`Plane recusou o comentário (HTTP ${r.status})`, { http: r.status });
    if (!UUID.test(comentario?.id ?? '') || idDe(comentario.actor ?? comentario.created_by) !== autorEsperado ||
        comentario.external_source !== FONTE || comentario.external_id !== externalId) {
      throw falha('Plane não confirmou o comentário da mesa e sua autoria');
    }
    return { id: comentario.id, repetido: r.status === 409 };
  }

  // A resposta do PATCH não decide nada (o Plane descarta label de outro projeto com 200):
  // quem decide é a releitura de verificação, feita por quem chama.
  async function aplicar({ projetoId, cartaId, corpo, sinal }) {
    const base = escopo(projetoId, cartaId);
    const chaves = Object.keys(corpo ?? {});
    if (!chaves.length || chaves.some(k => !CAMPOS_PATCH.has(k)) ||
        ('labels' in corpo && (!Array.isArray(corpo.labels) || corpo.labels.some(id => !UUID.test(id)))) ||
        ('state' in corpo && !UUID.test(corpo.state)) || ('description_html' in corpo && typeof corpo.description_html !== 'string')) {
      throw falha('PATCH fora da lista fechada da mesa', { semEscrita: true });
    }
    const chave = await lerChave();
    const r = await pedir(chave, `${base}/`, { method: 'PATCH', corpo, sinal });
    if (!r.ok) throw falha(`Plane recusou a alteração (HTTP ${r.status})`, { http: r.status });
    return { status: r.status };
  }

  return { autor: autorEsperado, conferirIdentidade, comentar, aplicar };
}
