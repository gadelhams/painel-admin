// Proposta pendente da reflexão noturna (`c3po/memoria-pendente.json`): a versão que a reflexão não aplicou sozinha por apagar demais. Não grava a memória; o dono aceita pelo SSO.
//
// Uma só: a reflexão da noite seguinte substitui a anterior. Aceitar ou descartar
// apaga o arquivo; a reflexão em si fica no diário `reflexao.jsonl`.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DIRETORIO_C3PO } from './arquivo-memoria.js';

export function criarPendenteMemoria({ diretorio = DIRETORIO_C3PO } = {}) {
  const arquivo = path.join(diretorio, 'memoria-pendente.json');

  async function ler() {
    let dados;
    try { dados = JSON.parse(await fs.readFile(arquivo, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; return { ilegivel: true }; }
    const ok = dados && typeof dados.id === 'string' && typeof dados.texto === 'string' && typeof dados.base === 'string';
    return ok ? dados : { ilegivel: true };
  }

  async function gravar({ quando, base, texto, motivo, diff, fracaoApagada }) {
    await fs.mkdir(diretorio, { recursive: true, mode: 0o700 });
    const registro = { id: randomUUID(), quando, base, texto, motivo, diff, fracaoApagada };
    const tmp = `${arquivo}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(registro), { flag: 'wx', mode: 0o600 });
    await fs.rename(tmp, arquivo);
    return registro;
  }

  async function descartar(id) {
    const atual = await ler();
    if (atual?.id === id) await fs.rm(arquivo, { force: true });
  }

  return { arquivo, ler, gravar, descartar };
}
