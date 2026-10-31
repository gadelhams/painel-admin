// Diário de acréscimo das ações do C-3PO (proposta, preparo, confirmação, resultado). Só grava; não decide nem executa.

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { anexarJsonl } from '../orquestrador/leitor-jsonl.js';

const DIRETORIO_ACOES = path.join(os.homedir(), '.local', 'state', 'painel-admin', 'c3po');

export function criarDiarioAcoes({ diretorio = DIRETORIO_ACOES, agora = () => new Date() } = {}) {
  const arquivo = path.join(diretorio, 'acoes.jsonl');
  return {
    arquivo,
    async anotar(registro) {
      await fs.mkdir(diretorio, { recursive: true, mode: 0o700 });
      await anexarJsonl(arquivo, { quando: agora().toISOString(), ...registro });
    },
  };
}
