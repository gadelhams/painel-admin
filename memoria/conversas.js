// Diário mínimo das conversas do C-3PO (`c3po/conversas.jsonl`): pergunta e resposta truncadas e filtradas de segredo, retidas 14 dias. É o insumo da reflexão noturna; não decide nada.
//
// Até 31/10/2026 o painel não registrava conversa nenhuma (o SDK guarda a transcrição
// própria em ~/.claude/projects, com resultado cru de ferramenta: insumo errado para
// a reflexão). Aqui só entra o par pergunta/resposta, já passado pelo filtro.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from '../orquestrador/leitor-jsonl.js';
import { filtrarSegredo } from '../acoes/filtro-segredo.js';
import { DIRETORIO_C3PO } from './arquivo-memoria.js';

export const RETENCAO_DIAS = 14;
const MAX_PERGUNTA = 600;
const MAX_RESPOSTA = 1_200;

const cortar = (texto, max) => { const t = String(texto ?? '').trim(); return t.length > max ? `${t.slice(0, max)}…` : t; };

export function criarDiarioConversas({ diretorio = DIRETORIO_C3PO, agora = Date.now, ambiente = process.env } = {}) {
  const arquivo = path.join(diretorio, 'conversas.jsonl');
  // Filtra antes e depois de cortar: o corte pode partir um segredo que o filtro reconheceria inteiro.
  const limpo = (texto, max) => filtrarSegredo(cortar(filtrarSegredo(texto, ambiente), max), ambiente);

  async function anotar({ pergunta, resposta, sessao = null }) {
    await fs.mkdir(diretorio, { recursive: true, mode: 0o700 });
    await anexarJsonl(arquivo, { quando: new Date(agora()).toISOString(), sessao: typeof sessao === 'string' ? sessao.slice(0, 64) : null,
      pergunta: limpo(pergunta, MAX_PERGUNTA), resposta: limpo(resposta, MAX_RESPOSTA) });
  }

  async function ler() {
    let texto;
    try { texto = await fs.readFile(arquivo, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return lerJsonl(texto, 'diário de conversas').linhas;
  }

  async function desde(ms) {
    return (await ler()).filter(l => Date.parse(l.quando) >= ms);
  }

  // Reescreve o arquivo sem o que passou da retenção; devolve quantas linhas saíram.
  async function podar() {
    const linhas = await ler();
    const limite = agora() - RETENCAO_DIAS * 86_400_000;
    const ficam = linhas.filter(l => Date.parse(l.quando) >= limite);
    if (ficam.length === linhas.length) return 0;
    const tmp = `${arquivo}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, ficam.map(l => `${JSON.stringify(l)}\n`).join(''), { flag: 'wx', mode: 0o600 });
    await fs.rename(tmp, arquivo);
    return linhas.length - ficam.length;
  }

  return { arquivo, anotar, ler, desde, podar };
}
