// Conversa do C-3PO. As ferramentas e a voz moram em motor/; aqui só o fluxo de eventos.

import { query } from '@anthropic-ai/claude-agent-sdk';
import { ferramentas } from './motor/ferramentas.js';
import { PERSONA } from './motor/persona.js';

const MODELO = 'claude-sonnet-5';

export async function* conversar(mensagem, sessaoAnterior) {
  const opcoes = {
    model: MODELO,
    systemPrompt: PERSONA,
    tools: [],
    mcpServers: { c3po: ferramentas },
    allowedTools: [
      'mcp__c3po__estado_projetos',
      'mcp__c3po__estado_producao',
      'mcp__c3po__docs_projeto',
      'mcp__c3po__fila_orquestracao',
      'mcp__c3po__decisoes',
      'mcp__c3po__alinhamento',
    ],
    permissionMode: 'dontAsk',
    includePartialMessages: true,
    maxTurns: 16,
    cwd: import.meta.dirname,
  };
  if (sessaoAnterior) opcoes.resume = sessaoAnterior;

  const consulta = query({ prompt: mensagem, options: opcoes });
  let concluida = false;
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
              yield { tipo: 'ferramenta', nome: bloco.name.replace(/^mcp__c3po__/, '') };
            }
          }
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
