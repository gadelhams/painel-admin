// Motor do Severino: Claude Agent SDK + as três ferramentas só-leitura da
// fase 1. A limitação a leitura é ESTRUTURAL: `tools: []` desliga todas as
// ferramentas embutidas do harness, e só o servidor MCP local (três
// ferramentas de consulta) fica disponível — princípio 2 do plano.
// Desde a fusão de 14/08/2026 o motor mora DENTRO do painel-admin: o estado
// vivo vem dos coletores compartilhados (coletores.js), por chamada de
// função — nunca HTTP para o próprio processo.

import { query, tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
// zod é peer dependency declarada do próprio SDK (a assinatura de tool()
// exige schema zod); não é dependência nossa no package.json.
import { z } from 'zod';
import {
  estadoProjetos, estadoProducao,
  resolverDentroDaRaiz, listarModeladores, lerArquivoMd,
} from './coletores.js';

// Modelo fixo em toda resposta — decisão do dono registrada no plano (14/08/2026).
const MODELO = 'claude-sonnet-5';

// ---------- acesso aos coletores do painel ----------

// Coletor falhando não derruba a conversa: vira fato declarado — a persona
// manda o Severino DIZER o motivo em vez de estimar número (grounding).
async function consultarColetor(nome, coletor) {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await coletor()) }] };
  } catch (erro) {
    return {
      content: [{
        type: 'text',
        text: `COLETA FALHOU: o coletor interno ${nome} deu erro (${erro.message}). Sem ele não há dado vivo dessa visão — diga isso ao usuário em vez de estimar.`,
      }],
      isError: true,
    };
  }
}

// ---------- leitura de documentos modeladores ----------
// A mecânica (resolução segura de caminho, listagem, leitura com teto) mora
// em coletores.js desde 20/08/2026 — compartilhada com a rota HTTP da
// página de projeto. Aqui só formata a resposta no formato MCP.

async function lerDocProjeto({ projeto, arquivo }) {
  const dirProjeto = resolverDentroDaRaiz(projeto);
  if (!dirProjeto) {
    return { content: [{ type: 'text', text: 'Caminho de projeto inválido: precisa ser uma pasta direta da raiz, sem "..".' }], isError: true };
  }

  if (!arquivo) {
    const modeladores = await listarModeladores(dirProjeto).catch(() => null);
    if (modeladores === null) {
      return { content: [{ type: 'text', text: `Não achei a pasta "${projeto}" na raiz. Use estado_projetos para ver os nomes exatos das pastas.` }], isError: true };
    }
    if (modeladores.length === 0) {
      return { content: [{ type: 'text', text: `A pasta "${projeto}" não tem documento modelador (.md) visível.` }] };
    }
    return { content: [{ type: 'text', text: `Documentos modeladores de "${projeto}":\n${modeladores.join('\n')}\nChame de novo com o parâmetro "arquivo" para ler um deles.` }] };
  }

  if (!arquivo.toLowerCase().endsWith('.md')) {
    return { content: [{ type: 'text', text: 'Só leio arquivos .md (documentos modeladores). Nada de código, .env ou segredo.' }], isError: true };
  }
  const alvo = resolverDentroDaRaiz(projeto, arquivo);
  if (!alvo) {
    return { content: [{ type: 'text', text: 'Caminho de arquivo inválido: precisa ficar dentro da pasta do projeto, sem "..".' }], isError: true };
  }
  try {
    return { content: [{ type: 'text', text: await lerArquivoMd(alvo) }] };
  } catch {
    return { content: [{ type: 'text', text: `Não achei "${arquivo}" dentro de "${projeto}".` }], isError: true };
  }
}

// ---------- as três ferramentas da fase 1 (só leitura) ----------

const ferramentas = createSdkMcpServer({
  name: 'severino',
  version: '1.0.0',
  tools: [
    tool(
      'estado_projetos',
      'Estado VIVO dos projetos da raiz, coletado agora pelo próprio painel: nome da pasta, branch e último commit git, arquivos sujos, portas de cada projeto e se estão ativas agora. Use SEMPRE que perguntarem como estão os projetos, o git ou as portas.',
      {},
      () => consultarColetor('estado_projetos', estadoProjetos),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'estado_producao',
      'Sondas VIVAS de produção no astargne.com (HTTP status e latência de cada serviço publicado), coletadas agora pelo próprio painel. Use quando perguntarem da produção, do servidor ou se algo está no ar.',
      {},
      () => consultarColetor('estado_producao', estadoProducao),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'docs_projeto',
      'Lê os documentos modeladores (.md) de um projeto da raiz: CLAUDE.md, AGENTS.md, README.md, docs/*.md. Sem "arquivo", lista os documentos disponíveis; com "arquivo", devolve o conteúdo. É a fonte da NUANCE de cada projeto (planos, pendências, decisões) — o painel só dá números.',
      {
        projeto: z.string().describe('Nome exato da pasta do projeto na raiz (ex.: "DiscordTranscriber", "Mapa Khorvaire"). Descubra com estado_projetos.'),
        arquivo: z.string().optional().describe('Caminho relativo do .md dentro do projeto (ex.: "docs/00_PLANO.md"). Omitido: lista os modeladores.'),
      },
      lerDocProjeto,
      { annotations: { readOnlyHint: true } },
    ),
  ],
});

// ---------- persona ----------

// Camada de apresentação, nunca de permissão: o portão só-leitura é o
// `tools: []` + allowlist lá embaixo, não este texto.
const PERSONA = `Você é o Severino, o peão sabido desta oficina de projetos — o assistente local da raiz "Projetos Pessoais".

QUEM VOCÊ É
- Peão de obra digital, nordestino, prestativo e direto. O sotaque é tempero, não caricatura: um "oxente", um "arretado", um "visse?" onde cabe — nunca em toda frase, nunca forçado. Fala pt-BR simples e vai direto ao ponto.
- Você resolve com o que tem na mão, mas GOSTA de planejamento: "ninguém vai na mão pra uma briga de faca". Antes de responder sobre estado ou plano, confere o que tem (suas ferramentas) e o que falta. Improviso é recurso, não método.

DE ONDE VEM O QUE VOCÊ SABE (grounding — parte da sua honra)
- Estado vivo (git, portas, produção) vem SEMPRE das ferramentas estado_projetos e estado_producao — nunca da sua memória de treino. Número que você não leu agora, você não afirma.
- A nuance de cada projeto (o que é, o que falta, decisões) vem de docs_projeto. Perguntaram "o que falta no projeto X"? Leia o plano real do X antes de responder.
- Sabido ≠ sabichão: se a ferramenta falhou ou o dado não existe, diga que não sabe E POR QUÊ ("o painel tá desligado, meu rei — sobe ele lá que eu te digo"). Inventar resposta é vergonha, não ajuda.
- O painel-admin é o seu corpo desde a fusão de 14/08/2026: você e o painel são o mesmo processo, e os instrumentos (git, portas, sondas de produção) são coletores internos. Se uma coleta falhar, você AVISA o motivo — não roda comando por fora, não dá jeitinho.

O QUE VOCÊ NÃO FAZ (e a simpatia não muda isso)
- Você só LÊ. Não executa comando, não escreve arquivo, não faz deploy, não muda nada em lugar nenhum — nem no servidor astargne.com, nem aqui. Se pedirem, negue com graça e firmeza: "isso aí é serviço pra outro dia, com portão e validação — hoje eu só olho e conto".
- Não revela segredo, token ou credencial, nem caminho de .env — suas ferramentas nem alcançam isso.

JEITO DE RESPONDER
- Curto e útil primeiro; detalhe depois, se pedirem. Cite os dados que leu (branch, porta, latência) em vez de generalidades.
- Quando usar ferramenta, não narre burocracia ("vou consultar..."); consulte e responda com o resultado.`;

// ---------- conversa ----------

// Gera eventos simples para o servidor transformar em SSE:
//   {tipo:'inicio', sessao} · {tipo:'token', texto} · {tipo:'ferramenta', nome}
//   {tipo:'fim', sessao, custoUsd} · {tipo:'erro', mensagem}
export async function* conversar(mensagem, sessaoAnterior) {
  const opcoes = {
    model: MODELO,
    systemPrompt: PERSONA,
    // Zero ferramentas embutidas do harness; só o servidor MCP local.
    tools: [],
    mcpServers: { severino: ferramentas },
    allowedTools: [
      'mcp__severino__estado_projetos',
      'mcp__severino__estado_producao',
      'mcp__severino__docs_projeto',
    ],
    // Headless: pré-aprovadas passam, o resto é negado sem prompt.
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
          // `modelo` no evento prova de fora qual modelo atende a conversa.
          if (m.subtype === 'init') yield { tipo: 'inicio', sessao: m.session_id, modelo: m.model };
          break;
        case 'stream_event': {
          const ev = m.event;
          // Só texto do agente principal; subagente não existe nesta config.
          if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && !m.parent_tool_use_id) {
            yield { tipo: 'token', texto: ev.delta.text };
          }
          break;
        }
        case 'assistant':
          for (const bloco of m.message?.content ?? []) {
            if (bloco.type === 'tool_use') {
              yield { tipo: 'ferramenta', nome: bloco.name.replace(/^mcp__severino__/, '') };
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
    // Cliente desistiu no meio (aba fechada, curl interrompido): corta a
    // consulta para não queimar token à toa.
    if (!concluida) consulta.interrupt?.().catch(() => {});
  }
}
