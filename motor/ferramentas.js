// Catálogo das seis ferramentas só de leitura. O portão é esta lista, não o texto da persona.

import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { estadoProjetos, estadoProducao, decisoesDoBacklog } from '../coletores.js';
import { criarServicoOrquestracao } from '../orquestrador/fila.js';
import { criarTriagemDev } from '../orquestrador/triagem.js';
import { consultarOrquestracaoC3po } from '../orquestrador/consulta-c3po.js';
import { resumirDecisoes } from '../decisoes-c3po.js';
import { criarServicoChaves } from '../chaves.js';
import { criarAlinhamento } from '../alinhamento.js';
import { EnvelopeColetor } from './envelope-coletor.js';
import { DocProjeto } from './doc-projeto.js';

const orquestracao = criarServicoOrquestracao();
const triagemDev = criarTriagemDev();
const chaves = criarServicoChaves();
const alinhamento = criarAlinhamento();
const envelope = new EnvelopeColetor();
const docs = new DocProjeto();

export const ferramentas = createSdkMcpServer({
  name: 'c3po',
  version: '1.0.0',
  tools: [
    tool(
      'estado_projetos',
      'Estado VIVO dos projetos da raiz, coletado agora pelo próprio painel: nome da pasta, branch e último commit git, arquivos sujos, portas de cada projeto e se estão ativas agora. Use SEMPRE que perguntarem como estão os projetos, o git ou as portas.',
      {},
      () => envelope.consultar('estado_projetos', estadoProjetos),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'estado_producao',
      'Sondas VIVAS de produção no astargne.com (HTTP status e latência de cada serviço publicado), coletadas agora pelo próprio painel. Use quando perguntarem da produção, do servidor ou se algo está no ar.',
      {},
      () => envelope.consultar('estado_producao', estadoProducao),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'docs_projeto',
      'Lê os documentos modeladores (.md) de um projeto da raiz: CLAUDE.md, AGENTS.md, README.md, docs/*.md. Sem "arquivo", lista os documentos disponíveis; com "arquivo", devolve o conteúdo. É a fonte da NUANCE de cada projeto (planos, pendências, decisões) — o painel só dá números.',
      {
        projeto: z.string().describe('Nome exato da pasta do projeto na raiz (ex.: "DiscordTranscriber", "Mapa Khorvaire"). Descubra com estado_projetos.'),
        arquivo: z.string().optional().describe('Caminho relativo do .md dentro do projeto (ex.: "docs/00_PLANO.md"). Omitido: lista os modeladores.'),
      },
      entrada => docs.ler(entrada),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'fila_orquestracao',
      'Consulta só-leitura do Plane. modo fila (padrão): candidatas com gate e impedimentos. modo triagem_dev: categorias das cartas abertas sem gate, com filtro opcional categoria/identificador. modo prontidao: pré-checagem detalhada de READY TO DEV ou READY TO TEST para uma carta, distinguindo pendências do gate e do despacho. Classificação não é decisão de produto; para escopo/aceite, leia também docs_projeto. Nunca marque gate ou execute.',
      {
        modo: z.enum(['fila', 'triagem_dev', 'prontidao']).optional(),
        identificador: z.string().optional().describe('ID da carta no Plane, ex.: PAINEL-31. Obrigatório em modo prontidao.'),
        categoria: z.string().optional().describe('Código da categoria devolvido por triagem_dev para filtrar cartas sem gate.'),
        gate: z.enum(['READY TO DEV', 'READY TO TEST']).optional().describe('Gate proposto em modo prontidao; padrão READY TO DEV.'),
      },
      entrada => envelope.consultar('fila_orquestracao', () => consultarOrquestracaoC3po({ orquestracao, triagemDev }, entrada)),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'decisoes',
      'Decisões paradas de todos os projetos (a mesma leitura da aba Decisões e do bloco "Astargne"): o que depende do Mestre (chaves, push/deploy, provas, produto), cadeias BLOQUEADAS que uma decisão dele destrava, bloqueios por terceiros, rotações já registradas, pós-playtest e sem escopo. Projetos congelados ficam de fora. Use para discutir dependências e prioridades; o vínculo entre cards vem do detalhe da etiqueta, não é grafo formal. Só leitura.',
      {
        foco: z.string().optional().describe('Pasta exata de um projeto (ex.: "CadastroUnico") ou um card (ex.: "CAD-1") para restringir.'),
      },
      entrada => envelope.consultar('decisoes', async () => resumirDecisoes({
        decisoes: await decisoesDoBacklog(), projetos: await estadoProjetos().then(r => r.projetos ?? r).catch(() => []),
        chaves: await chaves.inventario().catch(() => ({ pendentes: [], rotacoesFeitas: [] })), foco: entrada?.foco ?? null })),
      { annotations: { readOnlyHint: true } },
    ),
    tool(
      'alinhamento',
      'Dívida de alinhamento código ⇄ Plane ⇄ painel, por projeto (rotina de 30 min do painel): fio de card com 8+ comentários sem COMPACTADO/v1, card selado sem compactar, docs/current.md mais velho que o último commit, doc citando card já fechado, commits sem push, portão de docs vermelho, pasta do catálogo ausente; e onde mora a documentação funcional/arquitetural/técnica de cada projeto. Use para dizer o que está desatualizado e o que o orquestrador deve compactar ou corrigir no próximo fecho. Só leitura; nunca corrige.',
      { projeto: z.string().optional().describe('Pasta exata de um projeto para restringir.') },
      entrada => envelope.consultar('alinhamento', async () => { const r = await alinhamento.ler(); return entrada?.projeto ? { ...r, projetos: r.projetos.filter(p => p.pasta === entrada.projeto) } : r; }),
      { annotations: { readOnlyHint: true } },
    ),
  ],
});
