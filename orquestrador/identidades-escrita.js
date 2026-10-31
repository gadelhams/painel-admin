// Identidades técnicas de escrita por projeto, a partir do catálogo (`identidadeEscrita` em projetos.js), e a conferência delas no arranque (J56). Não escreve no Plane.
//
// Regras (J56 do parecer de 31/10/2026):
// - o ator é FIXO por projeto no catálogo (nunca derivado do token) e `/users/me` tem de bater;
// - a chave mora em `~/.config/plane/<arquivo>.token`, nome por lista branca
//   (`^orquestrador-[a-z]+$`), modo 600 e dono conferidos, lida UMA vez por operação e nunca
//   posta em `process.env`; a cópia usada tem de ser a que a conferência validou (hash);
// - no arranque: chaves e atores distintos dois a dois (Guest, zelador, Painel Admin e cada
//   orquestrador-*); papel no projeto = Member (15), nunca Admin; no workspace, nada acima de
//   Member. Divergência desliga só aquela identidade, com o motivo que a tela mostra;
// - CKBL e PLAYER (legado, `legadoEnv`): enquanto o arquivo não existe, chave e ator vêm do
//   `.env` como antes (PLANE_ORQ_[PLAYER_]WRITE_*); com o arquivo, o ator continua o do `.env`.
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UUID } from './uuid.js';

export const ARQUIVO_IDENTIDADE = /^orquestrador-[a-z]+$/;
export const DIRETORIO_CHAVES = path.join(os.homedir(), '.config', 'plane');
const ROLE_MEMBER = 15;
const ROLE_ADMIN = 20;
const hash = x => createHash('sha256').update(x).digest('hex');

// A chave de um arquivo da lista branca: arquivo comum (não link), 600, deste usuário.
export async function lerChaveArquivo(caminho) {
  const info = await fs.lstat(caminho).catch(() => null);
  if (!info?.isFile()) throw new Error('chave ausente');
  if ((info.mode & 0o077) !== 0 || (typeof process.getuid === 'function' && info.uid !== process.getuid())) {
    throw new Error('chave com permissão frouxa (exige 600 e dono)');
  }
  const chave = (await fs.readFile(caminho, 'utf8')).trim();
  if (!/^\S{16,}$/.test(chave)) throw new Error('chave ilegível');
  return chave;
}

const existeArquivo = caminho => { try { return lstatSync(caminho).isFile(); } catch { return false; } };

/**
 * Lê o catálogo e monta uma entrada por projeto com `identidadeEscrita`. Síncrono (a montagem
 * não faz rede); a conferência é `conferir()`, chamada no `iniciar()` e de tempos em tempos.
 * fabricas: { handoff, gate, estado, reserva? } — os escritores (recebem `chave` como função).
 */
export function montarIdentidadesEscrita({ projetos, ambiente = {}, proprietarioId, fabricas, fetchImpl = fetch,
  apiBase = ambiente.PLANE_API_BASE ?? 'http://127.0.0.1:8095', diretorio = DIRETORIO_CHAVES,
  existe = existeArquivo, lerChave = lerChaveArquivo, atoresReservados = {}, chavesReservadas = async () => ({}), agora = Date.now, log = () => {} }) {
  const entradas = [];
  const situacoes = new Map();
  const desligar = (projetoId, motivo) => situacoes.set(projetoId, { estado: 'desligada', motivo, em: new Date(agora()).toISOString() });
  for (const p of projetos.filter(x => x.identidadeEscrita && x.plane)) {
    const { arquivo, ator: atorFixo = null, legadoEnv = null } = p.identidadeEscrita;
    if (!ARQUIVO_IDENTIDADE.test(arquivo ?? '')) { desligar(p.plane, 'arquivo de chave fora da lista branca'); continue; }
    const caminho = path.join(diretorio, `${arquivo}.token`);
    const prefixo = legadoEnv === null ? null : `PLANE_ORQ_${legadoEnv}WRITE_`;
    const chaveEnv = prefixo ? ambiente[`${prefixo}KEY`]?.trim() : null;
    const projetoEnv = prefixo ? ambiente[`${prefixo}PROJECT_ID`]?.trim() : null;
    const ator = atorFixo ?? (prefixo ? ambiente[`${prefixo}ACTOR_ID`]?.trim() : null);
    const temArquivo = existe(caminho);
    if (!temArquivo && !chaveEnv && !(prefixo && (projetoEnv || ator))) continue;
    if (!/^[1-9]\d{0,9}$/.test(proprietarioId ?? '')) { desligar(p.plane, 'ORQ_OWNER_USER_ID ausente'); continue; }
    if (!UUID.test(ator ?? '')) { desligar(p.plane, 'ator da identidade ausente ou inválido'); continue; }
    if (!temArquivo && (!chaveEnv || projetoEnv !== p.plane)) { desligar(p.plane, 'configuração do .env incompleta ou de outro projeto'); continue; }
    entradas.push({ projeto: p, ator, origem: temArquivo ? 'arquivo' : 'env', caminho, chaveEnv: temArquivo ? null : chaveEnv });
    situacoes.set(p.plane, { estado: 'pendente', motivo: 'conferência de arranque ainda não rodou' });
  }

  const verificadas = new Map();
  const snapshot = async (e) => (e.origem === 'arquivo' ? lerChave(e.caminho) : e.chaveEnv);
  // Uma cópia da chave por operação; só vale a que a última conferência validou.
  const chaveDaOperacao = e => async () => {
    if (situacoes.get(e.projeto.plane)?.estado !== 'ok') throw new Error('identidade de escrita desligada');
    const chave = await snapshot(e);
    if (hash(chave) !== verificadas.get(e.projeto.plane)) throw new Error('chave mudou desde a conferência; aguarde a próxima');
    return chave;
  };

  const identidades = {};
  for (const e of entradas) {
    const opcoes = { chave: chaveDaOperacao(e), projetoPermitido: e.projeto.plane, autorEsperado: e.ator, fetchImpl, apiBase };
    try {
      identidades[e.projeto.plane] = { autorEscrita: e.ator, sigla: e.projeto.sigla ?? null,
        escritorHandoff: fabricas.handoff(opcoes), escritorGate: fabricas.gate(opcoes), escritorEstado: fabricas.estado(opcoes),
        ...(fabricas.reserva ? { escritorReserva: fabricas.reserva(opcoes) } : {}) };
    } catch { desligar(e.projeto.plane, 'escritor não montou'); }
  }

  async function pedir(chave, caminho) {
    const r = await fetchImpl(`${apiBase}/api/v1${caminho}`, { headers: { 'X-API-Key': chave }, signal: AbortSignal.timeout(15_000) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  }

  // Conferência inteira; cada divergência desliga só a sua identidade. Rede fora = pendente.
  async function conferir() {
    const chaves = new Map();
    const reservadas = await chavesReservadas().catch(() => ({}));
    for (const [nome, chave] of Object.entries({ guest: ambiente.PLANE_API_KEY?.trim(), ...reservadas })) if (chave) chaves.set(nome, chave);
    const atores = new Map(Object.entries(atoresReservados).filter(([, v]) => UUID.test(v ?? '')));
    if (ambiente.PLANE_API_KEY?.trim()) {
      const eu = await pedir(ambiente.PLANE_API_KEY.trim(), '/users/me/').catch(() => null);
      if (UUID.test(eu?.corpo?.id ?? '')) atores.set('guest', eu.corpo.id);
    }
    if (ambiente.PLANE_API_KEY?.trim() && !atores.has('guest')) {
      for (const e of entradas) if (identidades[e.projeto.plane] && situacoes.get(e.projeto.plane)?.estado !== 'desligada') {
        situacoes.set(e.projeto.plane, { estado: 'pendente', motivo: 'ator da chave Guest não conferido (Plane indisponível?); nova tentativa adiante' });
      }
      return estado();
    }
    const lidas = new Map();
    for (const e of entradas) {
      const id = e.projeto.plane;
      if (!identidades[id]) continue;
      try { lidas.set(id, await snapshot(e)); } catch (erro) { desligar(id, erro.message); }
    }
    const repetida = (id, valor, mapa) => [...mapa].find(([outro, v]) => outro !== id && v === valor)?.[0] ?? null;
    for (const e of entradas) {
      const id = e.projeto.plane;
      const chave = lidas.get(id);
      if (!chave) continue;
      const nome = `orquestrador ${e.projeto.sigla ?? id}`;
      const igualReservada = repetida(id, chave, chaves);
      const igualOutra = repetida(id, chave, lidas);
      if (igualReservada || igualOutra) { desligar(id, `chave igual à de outra identidade (${igualReservada ?? 'outro orquestrador'})`); continue; }
      const igualAtor = repetida(id, e.ator, atores) ?? entradas.find(o => o !== e && o.ator === e.ator)?.projeto.sigla;
      if (igualAtor) { desligar(id, `ator igual ao de outra identidade (${igualAtor})`); continue; }
      let eu;
      let projeto;
      let membros;
      try {
        eu = await pedir(chave, '/users/me/');
        projeto = await pedir(chave, `/workspaces/astargne/projects/${id}/`);
        membros = await pedir(chave, '/workspaces/astargne/members/');
      } catch {
        situacoes.set(id, { estado: 'pendente', motivo: 'Plane indisponível na conferência; nova tentativa adiante' });
        continue;
      }
      if (eu.status !== 200 || eu.corpo?.id !== e.ator) { desligar(id, `/users/me não bate com o ator fixo de ${nome}`); continue; }
      if (projeto.status !== 200 || projeto.corpo?.member_role !== ROLE_MEMBER) { desligar(id, `papel no projeto não é Member (${projeto.corpo?.member_role ?? `HTTP ${projeto.status}`})`); continue; }
      // Guest no workspace responde 403 aqui; Member lista (e o próprio papel tem de ser < Admin).
      const proprio = Array.isArray(membros.corpo) ? membros.corpo.find(m => m?.id === e.ator) : null;
      if (!(membros.status === 403 || (membros.status === 200 && Number.isInteger(proprio?.role) && proprio.role < ROLE_ADMIN))) {
        desligar(id, `papel no workspace acima de Member ou ilegível (HTTP ${membros.status})`); continue;
      }
      verificadas.set(id, hash(chave));
      situacoes.set(id, { estado: 'ok', motivo: null, em: new Date(agora()).toISOString(), origem: e.origem });
    }
    for (const [id, s] of situacoes) if (s.estado === 'desligada') log(`[orquestracao] identidade de ${id} desligada: ${s.motivo}`);
    return estado();
  }

  function estado() {
    return Object.fromEntries([...situacoes].map(([id, s]) => [id, { ...s }]));
  }

  return { identidades, conferir, estado, situacao: id => situacoes.get(id) ?? null };
}
