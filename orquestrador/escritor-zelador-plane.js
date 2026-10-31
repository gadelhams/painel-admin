// Escritor estreito do zelador no Plane: comentário com prefixo fixo e a lista fechada (estado Done/Cancelled, descrição, etiquetas de trava), com a chave lida de arquivo 600 a cada operação. Não decide veredito.
//
// Regras (invariants.md §6; J26–J28, J56, J62, J65, J68 do plano e do parecer de 31/10/2026;
// B6, B13, B15, B19, B20 e B28 da correção):
// - a chave mora em `~/.config/plane/zelador.token` (modo 600, dono = este usuário), nunca em
//   `process.env`; é lida UMA vez por operação e a mesma cópia serve a todas as chamadas dela;
//   chave igual à Guest, a outra identidade de escrita ou a um `orquestrador-*.token`/
//   `painel-admin.token` da mesma pasta (por hash, nunca logado) recusa;
// - o ator é conferido em `/users/me` contra o UUID fixo do zelador (não derivado do token) e o
//   autor de cada comentário criado também;
// - cada escrita confere o escopo (play ∩ catálogo ∩ não congelado ∩ ≠ CKBL ∩ ≠ ANYA); o recibo de
//   fechamento confere outro escopo, `escopoRecibo` (projeto elegível com aquele PENDENTE aberto
//   no índice), e por isso sai mesmo com o play desligado;
// - a mudança é revalidada contra a lista fechada aqui também (B6);
// - sob a trava (`sobTrava`, de quem chama) só vão as chamadas que precisam dela: no comentário,
//   o POST; na mudança, a releitura da carta e dos comentários e o PATCH, com teto curto por
//   chamada e no total (B19). `/users/me`, catálogo, releitura do 409 e verificação ficam fora;
// - comentário só com o prefixo `[ZELADOR/v1 ` e `external_source: zelador-hangar-v1`; 409 do
//   `external_id` só é "já gravado" se o comentário existente for do zelador, desta origem e com
//   o mesmo `external_id` (campos estruturados: o Plane sanitiza o HTML, B20);
// - a verificação relê e compara só os campos escritos (J65); a descrição, como texto.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { UUID } from './uuid.js';
import { ZELADOR_ATOR, atorDe, nomesDe } from './zelador-politica.js';
import { RESULTADOS_RECIBO, mesmoTexto, mudancaNaListaFechada } from './zelador-veredito.js';

export const ORIGEM_ZELADOR = 'zelador-hangar-v1';
const ARQUIVO_CHAVE_ZELADOR = path.join(os.homedir(), '.config', 'plane', 'zelador.token');
const PREFERIDOS = { completed: ['Done', 'Concluído', 'Concluido'], cancelled: ['Cancelled', 'Canceled', 'Cancelado'] };
// Quem espera a trava desiste em 60 s: sob ela, cada chamada tem 6 s e a seção inteira 20 s.
const TIMEOUT_SOB_TRAVA_MS = 6_000;
const TETO_SOB_TRAVA_MS = 20_000;
const RECIBO = new RegExp(`^([0-9a-f]{64}):recibo:(${RESULTADOS_RECIBO.join('|')})$`);
const VIZINHAS_PROIBIDAS = /^(?:orquestrador-[\w-]+|painel-admin)\.token$/;

const sha = t => createHash('sha256').update(t).digest('hex');
const erroDe = (mensagem, marcas) => Object.assign(new Error(mensagem), marcas);

async function lerChaveZelador(arquivo = ARQUIVO_CHAVE_ZELADOR) {
  if (path.basename(arquivo) !== 'zelador.token') throw new Error('arquivo de chave do zelador fora da lista');
  const info = await fs.lstat(arquivo).catch(() => null);
  if (!info?.isFile()) throw new Error('chave do zelador ausente');
  if ((info.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) throw new Error('chave do zelador com permissão frouxa (exige 600 e dono)');
  const chave = (await fs.readFile(arquivo, 'utf8')).trim();
  if (!/^\S{16,}$/.test(chave)) throw new Error('chave do zelador ilegível');
  return chave;
}

// B28: hashes das chaves das outras identidades que moram na mesma pasta. Vizinha ilegível
// recusa (não dá para provar a distinção); nada delas sai daqui além do hash.
async function hashesVizinhos(arquivo) {
  const pasta = path.dirname(arquivo);
  let nomes;
  try { nomes = await fs.readdir(pasta); } catch { throw new Error('pasta das chaves ilegível'); }
  const hashes = new Set();
  for (const nome of nomes.filter(n => VIZINHAS_PROIBIDAS.test(n))) {
    let texto;
    try { texto = await fs.readFile(path.join(pasta, nome), 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') continue; throw new Error('chave de outra identidade ilegível; distinção não conferida'); }
    if (texto.trim()) hashes.add(sha(texto.trim()));
  }
  return hashes;
}

export function criarEscritorZelador({ escopoPermitido, escopoRecibo = null, arquivoChave = ARQUIVO_CHAVE_ZELADOR, chavesProibidas = new Set(),
  ator = ZELADOR_ATOR, apiBase = process.env.PLANE_API_BASE ?? 'http://127.0.0.1:8095', fetchImpl = fetch, lerChave = lerChaveZelador,
  timeoutSobTravaMs = TIMEOUT_SOB_TRAVA_MS, tetoSobTravaMs = TETO_SOB_TRAVA_MS }) {
  if (typeof escopoPermitido !== 'function' || !UUID.test(ator)) throw new Error('escritor do zelador sem escopo ou ator');
  const raiz = `${apiBase}/api/v1`;
  const foraDoEscopo = () => erroDe('projeto fora do escopo do zelador (play, catálogo, congelado, CKBL, ANYA)', { escopo: true });

  // `chaveRecibo`: o recibo confere o escopo dele (PENDENTE aberto), não o play ligado.
  const noEscopo = async (projetoId, chaveRecibo) => (chaveRecibo !== undefined && escopoRecibo
    ? escopoRecibo(projetoId, chaveRecibo) : escopoPermitido(projetoId));

  // Uma operação = uma leitura da chave + /users/me; tudo o que ela pede usa a mesma cópia.
  async function sessao(projetoId, chaveRecibo) {
    if (!UUID.test(projetoId ?? '') || !(await noEscopo(projetoId, chaveRecibo))) throw foraDoEscopo();
    const chave = await lerChave(arquivoChave);
    if (chavesProibidas.has(chave) || (await hashesVizinhos(arquivoChave)).has(sha(chave))) throw new Error('chave do zelador igual a outra identidade');
    const pedir = async (caminho, opcoes = {}) => {
      const { timeoutMs = 15_000, ...resto } = opcoes;
      const r = await fetchImpl(`${raiz}${caminho}`, { ...resto, redirect: 'error',
        headers: { 'X-API-Key': chave, ...(resto.body ? { 'content-type': 'application/json' } : {}) }, signal: AbortSignal.timeout(Math.max(1, timeoutMs)) });
      const corpo = await r.json().catch(() => null);
      return { status: r.status, ok: r.ok, corpo };
    };
    const eu = await pedir('/users/me/');
    if (!eu.ok || eu.corpo?.id !== ator) throw new Error('identidade do zelador não confere');
    const base = `/workspaces/astargne/projects/${projetoId}/work-items`;
    return { pedir, base };
  }

  // O prazo da seção sob a trava: cada chamada pega o menor entre o teto dela e o que resta.
  const prazoSobTrava = () => { const fim = Date.now() + tetoSobTravaMs; return () => Math.min(timeoutSobTravaMs, fim - Date.now()); };

  const exigir = (r, oque) => { if (!r.ok || !r.corpo) throw new Error(`Plane recusou ${oque} (HTTP ${r.status})`); return r.corpo; };

  async function comentar({ projetoId, cartaId, html, externalId, sobTrava = acao => acao() }) {
    if (!UUID.test(cartaId ?? '') || typeof html !== 'string' || !html.startsWith('<p>[ZELADOR/v1 ') || !/^[\w:.-]{16,120}$/.test(externalId ?? '')) {
      throw new Error('comentário fora da forma do zelador');
    }
    const recibo = RECIBO.exec(externalId);
    if (recibo && !html.startsWith(`<p>[ZELADOR/v1 recibo=${recibo[2]} `)) throw new Error('comentário fora da forma do zelador');
    const { pedir, base } = await sessao(projetoId, recibo ? recibo[1] : undefined);
    const r = await sobTrava(async () => {
      if (!(await noEscopo(projetoId, recibo ? recibo[1] : undefined))) throw foraDoEscopo();
      return pedir(`${base}/${cartaId}/comments/`, { method: 'POST', timeoutMs: timeoutSobTravaMs,
        body: JSON.stringify({ comment_html: html, external_source: ORIGEM_ZELADOR, external_id: externalId }) });
    });
    if (r.status === 409 && UUID.test(r.corpo?.id ?? '')) {
      const existente = exigir(await pedir(`${base}/${cartaId}/comments/${r.corpo.id}/`), 'a releitura do comentário');
      if (atorDe(existente) !== ator || existente.external_source !== ORIGEM_ZELADOR || existente.external_id !== externalId) {
        throw new Error('external_id já usado por outro comentário; conferir a carta');
      }
      return { comentarioId: existente.id, jaExistia: true };
    }
    const criado = exigir(r, 'o comentário');
    if (!UUID.test(criado.id ?? '') || atorDe(criado) !== ator) throw new Error('Plane não confirmou a autoria do comentário do zelador');
    return { comentarioId: criado.id, jaExistia: false };
  }

  // No começo do job, antes de gastar CLI: chave legível, escopo e ator conferidos. `soRecibos`:
  // o job que só fecha PENDENTE de projeto com play desligado (B13).
  async function conferir(projetoId, { soRecibos = false } = {}) { await sessao(projetoId, soRecibos ? null : undefined); return true; }

  // O alvo da mudança, lido FORA da trava: estado pelo grupo, etiquetas pelo nome único.
  async function alvoDa(pedir, projetoId, mudanca, descricaoNova) {
    if (mudanca.tipo === 'estado') {
      const estados = exigir(await pedir(`/workspaces/astargne/projects/${projetoId}/states/?per_page=100`), 'os estados');
      const grupos = mudanca.grupo === 'completed' ? ['completed'] : ['cancelled', 'canceled'];
      const candidatos = (estados.results ?? []).filter(e => grupos.includes(e.group) && UUID.test(e.id ?? ''));
      const alvo = candidatos.find(e => PREFERIDOS[mudanca.grupo].includes(e.name)) ?? candidatos[0];
      if (!alvo) throw new Error(`projeto sem estado ${mudanca.grupo}`);
      return { corpo: () => ({ state: alvo.id }), esperado: v => (typeof v.state === 'string' ? v.state : v.state?.id) === alvo.id };
    }
    if (mudanca.tipo === 'labels') {
      const catalogo = exigir(await pedir(`/workspaces/astargne/projects/${projetoId}/labels/?per_page=100`), 'as etiquetas');
      if (!Array.isArray(catalogo.results) || catalogo.next_page_results) throw new Error('catálogo de etiquetas incompleto');
      const unica = nome => { const a = catalogo.results.filter(x => x.name === nome); if (a.length !== 1 || !UUID.test(a[0].id ?? '')) throw new Error(`etiqueta ${nome} ausente ou repetida no projeto`); return a[0].id; };
      const adicionar = mudanca.adicionar.map(unica);
      const remover = new Set(mudanca.remover.map(unica));
      return { corpo: carta => ({ labels: [...new Set([...carta.labels.map(l => l.id).filter(i => !remover.has(i)), ...adicionar])] }),
        esperado: v => { const n = nomesDe(v); return mudanca.adicionar.every(x => n.includes(x)) && mudanca.remover.every(x => !n.includes(x)); } };
    }
    if (typeof descricaoNova !== 'string') throw new Error('descrição nova ausente');
    return { corpo: () => ({ description_html: descricaoNova }), esperado: v => mesmoTexto(v.description_html, descricaoNova) };
  }

  /**
   * Aplica UMA mudança da lista fechada. `sobTrava(acao)` é a trava de quem chama (J64, com o
   * fencing); dentro dela, `conferirAntes(cartaLida, comentarios)` roda depois da releitura e
   * antes do PATCH (digital, J63). Fora do escopo lança com `escopo: true`.
   */
  async function mudar({ projetoId, cartaId, mudanca, descricaoNova = null, conferirAntes = async () => {}, sobTrava = acao => acao() }) {
    if (!mudancaNaListaFechada(mudanca)) throw new Error('mudança fora da lista fechada');
    const { pedir, base } = await sessao(projetoId);
    const alvo = await alvoDa(pedir, projetoId, mudanca, descricaoNova);
    await sobTrava(async () => {
      const resta = prazoSobTrava();
      if (!(await escopoPermitido(projetoId))) throw foraDoEscopo();
      const carta = exigir(await pedir(`${base}/${cartaId}/?expand=state,labels`, { timeoutMs: resta() }), 'a leitura da carta');
      if (carta.id !== cartaId || !Array.isArray(carta.labels)) throw new Error('carta ilegível para o zelador');
      const pagina = exigir(await pedir(`${base}/${cartaId}/comments/?per_page=100`, { timeoutMs: resta() }), 'os comentários');
      const comentarios = Array.isArray(pagina) ? pagina : pagina.results;
      if (!Array.isArray(comentarios) || pagina.next_page_results) throw erroDe('comentários demais para conferir sob a trava', { abortar: true });
      await conferirAntes(carta, comentarios);
      exigir(await pedir(`${base}/${cartaId}/`, { method: 'PATCH', body: JSON.stringify(alvo.corpo(carta)), timeoutMs: resta() }), 'a mudança');
    });
    const verificada = exigir(await pedir(`${base}/${cartaId}/?expand=state,labels`), 'a releitura de verificação');
    return { conferiu: verificada.id === cartaId && alvo.esperado(verificada), versaoCarta: verificada.updated_at ?? null };
  }

  return { comentar, mudar, conferir };
}
