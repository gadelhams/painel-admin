// Conversa do C-3PO. As ferramentas e a voz moram em motor/; aqui só o fluxo de eventos.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ferramentas } from './motor/ferramentas.js';
import { PERSONA } from './motor/persona.js';
import { FERRAMENTA_PROPOSTA, propostasDaMensagem } from './motor/acao-proposta.js';
import { propostas } from './acoes/propostas.js';
import { FERRAMENTA_MEMORIA, propostasMemoriaDaMensagem } from './motor/memoria-proposta.js';
import { blocoMemoria } from './motor/memoria-l1.js';
import { propostasMemoria } from './memoria/propostas-memoria.js';
import { FERRAMENTA_DECISAO, propostasDecisaoDaMensagem } from './motor/decisao-proposta.js';
import { propostasDecisao } from './decisao.js';
import { criarLeitorMemoria } from './memoria/arquivo-memoria.js';

const MODELO = 'claude-sonnet-5';

// O .env do painel mora em process.env, e o SDK repassaria tudo ao CLI do modelo:
// chaves de escrita (Plane, Chaves) ficariam a uma regra de permissão de distância.
// O CLI só precisa achar o login em ~/.claude e rodar (PAINEL-52, 28/10/2026).
export const AMBIENTE_PERMITIDO = Object.freeze([
  'HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TMPDIR',
  'XDG_CONFIG_HOME', 'XDG_CACHE_HOME', 'XDG_DATA_HOME', 'XDG_STATE_HOME', 'XDG_RUNTIME_DIR',
  'CLAUDE_CONFIG_DIR', 'NODE_EXTRA_CA_CERTS',
]);

export function ambienteDoModelo(ambiente = process.env) {
  return Object.fromEntries(AMBIENTE_PERMITIDO.filter((k) => ambiente[k] !== undefined).map((k) => [k, ambiente[k]]));
}

const leitorMemoria = criarLeitorMemoria();

// A memória L1 entra a cada turno (o dono pode tê-la mudado entre um e outro), depois da
// persona e como dado delimitado; `memoria` ausente = só a persona (testes antigos).
export function opcoesDaConversa(sessaoAnterior, ambiente = process.env, memoria = undefined) {
  const opcoes = {
    model: MODELO,
    systemPrompt: memoria === undefined ? PERSONA : `${PERSONA}\n\n${blocoMemoria(memoria)}`,
    tools: [],
    mcpServers: { c3po: ferramentas },
    allowedTools: [
      'mcp__c3po__estado_projetos',
      'mcp__c3po__estado_producao',
      'mcp__c3po__docs_projeto',
      'mcp__c3po__fila_orquestracao',
      'mcp__c3po__decisoes',
      'mcp__c3po__alinhamento',
      'mcp__c3po__consulta_ssh',
      'mcp__c3po__git_projeto',
      'mcp__c3po__encomendas',
      'mcp__c3po__diario_zelador',
      'mcp__c3po__carta_plane',
      FERRAMENTA_PROPOSTA,
      FERRAMENTA_MEMORIA,
      FERRAMENTA_DECISAO,
    ],
    permissionMode: 'dontAsk',
    includePartialMessages: true,
    maxTurns: 16,
    cwd: import.meta.dirname,
    env: ambienteDoModelo(ambiente),
    // Nada de settings, hooks, MCPs ou CLAUDE.md do disco: só o que está aqui.
    settingSources: [],
    strictMcpConfig: true,
  };
  if (sessaoAnterior) opcoes.resume = sessaoAnterior;
  return opcoes;
}

export async function* conversar(mensagem, sessaoAnterior, { lerMemoria = leitorMemoria.ler } = {}) {
  const memoria = await lerMemoria().catch(e => ({ estado: 'ilegivel', motivo: e.code ?? 'erro de leitura' }));
  const consulta = query({ prompt: mensagem, options: opcoesDaConversa(sessaoAnterior, process.env, memoria) });
  let concluida = false;
  const idsProposta = new Set();
  const idsMemoria = new Set();
  const idsDecisao = new Set();
  try {
    for await (const m of consulta) {
      switch (m.type) {
        case 'system':
          if (m.subtype === 'init') yield { tipo: 'inicio', sessao: m.session_id, modelo: m.model };
          break;
        case 'stream_event': {
          const ev = m.event;
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && !m.parent_tool_use_id) {
            yield { tipo: 'token', texto: ev.delta.text };
          }
          break;
        }
        case 'assistant':
          for (const bloco of m.message?.content ?? []) {
            if (bloco.type === 'tool_use') {
              if (bloco.name === FERRAMENTA_PROPOSTA) idsProposta.add(bloco.id);
              if (bloco.name === FERRAMENTA_MEMORIA) idsMemoria.add(bloco.id);
              if (bloco.name === FERRAMENTA_DECISAO) idsDecisao.add(bloco.id);
              yield { tipo: 'ferramenta', nome: bloco.name.replace(/^mcp__c3po__/, '') };
            }
          }
          break;
        case 'user':
          // O cartão de ação do chat: leva id de proposta, nunca de confirmação.
          for (const p of propostasDaMensagem(m, idsProposta, propostas)) yield { tipo: 'proposta', ...p };
          for (const p of propostasMemoriaDaMensagem(m, idsMemoria, propostasMemoria)) yield { tipo: 'proposta_memoria', ...p };
          for (const p of propostasDecisaoDaMensagem(m, idsDecisao, propostasDecisao)) yield { tipo: 'proposta_decisao', ...p };
          break;
        case 'result':
          if (m.subtype === 'success') {
            yield { tipo: 'fim', sessao: m.session_id, custoUsd: m.total_cost_usd };
          } else {
            yield { tipo: 'erro', mensagem: `A conversa terminou com erro (${m.subtype}).` };
          }
          break;
        default:
          break;
      }
    }
    concluida = true;
  } finally {
    if (!concluida) consulta.interrupt?.().catch(() => {});
  }
}
