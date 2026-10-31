// Diário de acréscimo da mesa de decisão (pendente, comentário gravado, concluída, abandonada) e a leitura das aplicações pendentes. Só grava e lê; não fala com o Plane.
//
// É o que permite retomar: cada etapa entra ANTES do passo seguinte, e a retomada recomeça
// do último registro da chave (o padrão GATE_PENDENTE/GATE_APLICADO do registro-gate.js).
// Mora com o diário de ações do C-3PO (`<estado>/c3po/`).
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from '../orquestrador/leitor-jsonl.js';

const DIRETORIO = path.join(os.homedir(), '.local', 'state', 'painel-admin', 'c3po');
const ETAPAS = ['DECISAO_PENDENTE', 'COMENTARIO_GRAVADO', 'DECISAO_CONCLUIDA', 'DECISAO_ABANDONADA'];

export function criarDiarioDecisao({ diretorio = DIRETORIO, agora = () => Date.now() } = {}) {
  const arquivo = path.join(diretorio, 'decisoes.jsonl');

  async function linhas() {
    let texto;
    try { texto = await fs.readFile(arquivo, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    return lerJsonl(texto, 'diário da mesa').linhas;
  }

  // Uma entrada por chave, com a etapa mais adiantada e o registro de abertura.
  async function porChave() {
    const mapa = new Map();
    for (const l of await linhas()) {
      if (!ETAPAS.includes(l.tipo) || typeof l.chave !== 'string') continue;
      const atual = mapa.get(l.chave) ?? { chave: l.chave, abertura: null, comentarioId: null, fim: null };
      if (l.tipo === 'DECISAO_PENDENTE') atual.abertura = l;
      else if (l.tipo === 'COMENTARIO_GRAVADO') atual.comentarioId = l.comentarioId;
      else atual.fim = l;
      mapa.set(l.chave, atual);
    }
    return mapa;
  }

  return {
    arquivo,
    async anotar(registro) {
      await fs.mkdir(diretorio, { recursive: true, mode: 0o700 });
      await anexarJsonl(arquivo, { quando: new Date(agora()).toISOString(), ...registro });
    },
    async daChave(chave) { return (await porChave()).get(chave) ?? null; },
    async pendentes() {
      return [...(await porChave()).values()].filter(x => x.abertura && !x.fim).map(x => ({
        chave: x.chave, identificador: x.abertura.identificador, cartaId: x.abertura.cartaId, quando: x.abertura.quando,
        decisao: x.abertura.decisao, etapa: x.comentarioId ? 'comentario-gravado' : 'pendente', registro: x.abertura, comentarioId: x.comentarioId }));
    },
  };
}
