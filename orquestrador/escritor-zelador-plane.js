// Escritor estreito do zelador no Plane: comentário com prefixo fixo e a lista fechada (estado Done/Cancelled, descrição, etiquetas de trava), com a chave lida de arquivo 600 a cada operação. Não decide veredito.
//
// Regras (invariants.md §6; J26–J28, J56, J62, J65, J68 do plano e do parecer de 31/10/2026):
// - a chave mora em `~/.config/plane/zelador.token` (modo 600, dono = este usuário), nunca em
//   `process.env`; é lida UMA vez por operação e a mesma cópia serve a todas as chamadas dela;
//   chave igual à Guest ou a outra identidade de escrita recusa;
// - o ator é conferido em `/users/me` contra o UUID fixo do zelador (não derivado do token) e o
//   autor de cada comentário criado também;
// - cada escrita confere o escopo (play ∩ catálogo ∩ não congelado ∩ ≠ CKBL ∩ ≠ ANYA);
// - comentário só com o prefixo `[ZELADOR/v1 ` e `external_source: zelador-hangar-v1`; 409 do
//   `external_id` só é "já gravado" se o comentário existente for do zelador e IGUAL (J62);
// - a verificação relê e compara só os campos escritos (J65).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { UUID } from './uuid.js';
import { ZELADOR_ATOR, atorDe, nomesDe } from './zelador-politica.js';

export const ORIGEM_ZELADOR = 'zelador-hangar-v1';
const ARQUIVO_CHAVE_ZELADOR = path.join(os.homedir(), '.config', 'plane', 'zelador.token');
const PREFERIDOS = { completed: ['Done', 'Concluído', 'Concluido'], cancelled: ['Cancelled', 'Canceled', 'Cancelado'] };

async function lerChaveZelador(arquivo = ARQUIVO_CHAVE_ZELADOR) {
  if (path.basename(arquivo) !== 'zelador.token') throw new Error('arquivo de chave do zelador fora da lista');
  const info = await fs.lstat(arquivo).catch(() => null);
  if (!info?.isFile()) throw new Error('chave do zelador ausente');
  if ((info.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('chave do zelador com permissão frouxa (exige 600 e dono)');
  const chave = (await fs.readFile(arquivo, 'utf8')).trim();
  if (!/^\S{16,}$/.test(chave)) throw new Error('chave do zelador ilegível');
  return chave;
}

export function criarEscritorZelador({ escopoPermitido, arquivoChave = ARQUIVO_CHAVE_ZELADOR, chavesProibidas = new Set(),
  ator = ZELADOR_ATOR, apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch, lerChave = lerChaveZelador }) {
  if (typeof escopoPermitido !== 'function' || !UUID.test(ator)) throw new Error('escritor do zelador sem escopo ou ator');
  const raiz = `${apiBase}/api/v1`;

  // Uma operação = uma leitura da chave + /users/me; tudo o que ela pede usa a mesma cópia.
  async function sessao(projetoId) {
    if (!UUID.test(projetoId ?? '') || !(await escopoPermitido(projetoId))) throw new Error('projeto fora do escopo do zelador (play, catálogo, congelado, CKBL, ANYA)');
    const chave = await lerChave(arquivoChave);
    if (chavesProibidas.has(chave)) throw new Error('chave do zelador igual a outra identidade');
    const pedir = async (caminho, opcoes = {}) => {
      const r = await fetchImpl(`${raiz}${caminho}`, { ...opcoes, redirect: 'error',
        headers: { 'X-API-Key': chave, ...(opcoes.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(15_000) });
      const corpo = await r.json().catch(() => null);
      return { status: r.status, ok: r.ok, corpo };
    };
    const eu = await pedir('/users/me/');
    if (!eu.ok || eu.corpo?.id !== ator) throw new Error('identidade do zelador não confere');
    const base = `/workspaces/astargne/projects/${projetoId}/work-items`;
    return { pedir, base };
  }

  const exigir = (r, oque) => { if (!r.ok || !r.corpo) throw new Error(`Plane recusou ${oque} (HTTP ${r.status})`); return r.corpo; };

  async function comentar({ projetoId, cartaId, html, externalId }) {
    if (!UUID.test(cartaId ?? '') || typeof html !== 'string' || !html.startsWith('<p>[ZELADOR/v1 ') || !/^[\w:.-]{16,120}$/.test(externalId ?? '')) {
      throw new Error('comentário fora da forma do zelador');
    }
    const { pedir, base } = await sessao(projetoId);
    const r = await pedir(`${base}/${cartaId}/comments/`, { method: 'POST',
      body: JSON.stringify({ comment_html: html, external_source: ORIGEM_ZELADOR, external_id: externalId }) });
    if (r.status === 409 && UUID.test(r.corpo?.id ?? '')) {
      const existente = exigir(await pedir(`${base}/${cartaId}/comments/${r.corpo.id}/`), 'a releitura do comentário');
      if (atorDe(existente) !== ator || existente.comment_html !== html) throw new Error('external_id já usado por outro comentário; conferir a carta');
      return { comentarioId: existente.id, jaExistia: true };
    }
    const criado = exigir(r, 'o comentário');
    if (!UUID.test(criado.id ?? '') || atorDe(criado) !== ator) throw new Error('Plane não confirmou a autoria do comentário do zelador');
    return { comentarioId: criado.id, jaExistia: false };
  }

  // No começo do job, antes de gastar CLI: chave legível, escopo e ator conferidos.
  async function conferir(projetoId) { await sessao(projetoId); return true; }

  /**
   * Aplica UMA mudança da lista fechada. `conferirAntes(cartaLida)` roda depois da leitura e
   * antes do PATCH (digital, J63); quem chama segura a trava (J64).
   */
  async function mudar({ projetoId, cartaId, mudanca, descricaoNova = null, conferirAntes = async () => {} }) {
    const { pedir, base } = await sessao(projetoId);
    const carta = exigir(await pedir(`${base}/${cartaId}/?expand=state,labels`), 'a leitura da carta');
    if (carta.id !== cartaId || !Array.isArray(carta.labels)) throw new Error('carta ilegível para o zelador');
    await conferirAntes(carta);
    const corpo = {};
    let esperado;
    if (mudanca.tipo === 'estado') {
      const estados = exigir(await pedir(`/workspaces/astargne/projects/${projetoId}/states/?per_page=100`), 'os estados');
      const grupos = mudanca.grupo === 'completed' ? ['completed'] : ['cancelled', 'canceled'];
      const candidatos = (estados.results ?? []).filter(e => grupos.includes(e.group) && UUID.test(e.id ?? ''));
      const alvo = candidatos.find(e => PREFERIDOS[mudanca.grupo].includes(e.name)) ?? candidatos[0];
      if (!alvo) throw new Error(`projeto sem estado ${mudanca.grupo}`);
      corpo.state = alvo.id;
      esperado = v => (typeof v.state === 'string' ? v.state : v.state?.id) === alvo.id;
    } else if (mudanca.tipo === 'labels') {
      const catalogo = exigir(await pedir(`/workspaces/astargne/projects/${projetoId}/labels/?per_page=100`), 'as etiquetas');
      if (!Array.isArray(catalogo.results) || catalogo.next_page_results) throw new Error('catálogo de etiquetas incompleto');
      const unica = nome => { const a = catalogo.results.filter(x => x.name === nome); if (a.length !== 1 || !UUID.test(a[0].id ?? '')) throw new Error(`etiqueta ${nome} ausente ou repetida no projeto`); return a[0].id; };
      const adicionar = mudanca.adicionar.map(unica);
      const remover = new Set(mudanca.remover.map(unica));
      const ids = [...new Set([...carta.labels.map(l => l.id).filter(i => !remover.has(i)), ...adicionar])];
      corpo.labels = ids;
      esperado = v => { const n = nomesDe(v); return mudanca.adicionar.every(x => n.includes(x)) && mudanca.remover.every(x => !n.includes(x)); };
    } else if (mudanca.tipo === 'trecho' || mudanca.tipo === 'anexar') {
      if (typeof descricaoNova !== 'string') throw new Error('descrição nova ausente');
      corpo.description_html = descricaoNova;
      esperado = v => v.description_html === descricaoNova;
    } else throw new Error('mudança fora da lista fechada');
    exigir(await pedir(`${base}/${cartaId}/`, { method: 'PATCH', body: JSON.stringify(corpo) }), 'a mudança');
    const verificada = exigir(await pedir(`${base}/${cartaId}/?expand=state,labels`), 'a releitura de verificação');
    return { conferiu: verificada.id === cartaId && esperado(verificada), versaoCarta: verificada.updated_at ?? null };
  }

  return { comentar, mudar, conferir };
}
