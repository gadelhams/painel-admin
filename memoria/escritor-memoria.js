// Única escrita da memória L1: confere a base sob trava, registra a versão no histórico e troca o arquivo de uma vez. Não confere SSO nem decide se a mudança é boa.
//
// Só dois caminhos chegam aqui (invariante 4 em docs/invariants.md): a API do dono
// (api-memoria.js, SSO + duas ações) e a reflexão noturna (reflexao.js, com diário). O
// motor do C-3PO nunca, nem por transitividade (test/fronteiras-modulos.test.js).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl } from '../orquestrador/leitor-jsonl.js';
import { criarLeitorMemoria, DIRETORIO_C3PO, TETO_BYTES, bytesDe, hashTexto } from './arquivo-memoria.js';
import { diffMemoria } from './diff.js';

export const QUEM = Object.freeze(['dono', 'reflexao', 'proposta-aceita']);
const TRAVA_VELHA_MS = 60_000;
const ESPERA_TRAVA_MS = 5_000;

// Recusa que provadamente não gravou nada; o status vai para a resposta HTTP.
export const recusaMemoria = (mensagem, status = 422) => Object.assign(new Error(mensagem), { semEscrita: true, status });

// Trava entre processos (o painel e a reflexão do timer): mkdir é atômico. Uma trava
// mais velha que 60 s é de processo que caiu no meio e é recuperada.
// O relógio aqui é o de verdade, não o injetado: espera e idade da trava são tempo real.
async function comTrava(diretorio, fn) {
  const trava = path.join(diretorio, '.memoria.trava');
  const limite = Date.now() + ESPERA_TRAVA_MS;
  for (;;) {
    try { await fs.mkdir(trava); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const info = await fs.stat(trava).catch(() => null);
      if (info && Date.now() - info.mtimeMs > TRAVA_VELHA_MS) { await fs.rm(trava, { recursive: true, force: true }); continue; }
      if (Date.now() > limite) throw recusaMemoria('a memória está sendo gravada por outro processo; tente de novo', 409);
      await new Promise(r => setTimeout(r, 50));
    }
  }
  try { return await fn(); } finally { await fs.rm(trava, { recursive: true, force: true }).catch(() => {}); }
}

export function validarTextoMemoria(texto) {
  if (typeof texto !== 'string') throw recusaMemoria('a memória é texto');
  if (bytesDe(texto) > TETO_BYTES) throw recusaMemoria(`a memória passa do teto de ${TETO_BYTES} bytes (${bytesDe(texto)})`);
  if (texto.includes('\u0000')) throw recusaMemoria('a memória não aceita byte nulo');
  return texto;
}

export function criarEscritorMemoria({ diretorio = DIRETORIO_C3PO, agora = Date.now, renomear = fs.rename } = {}) {
  const leitor = criarLeitorMemoria({ diretorio });

  async function gravar({ texto, base, quem, origem = null, usuarioId = null, motivo = null }) {
    validarTextoMemoria(texto);
    if (!QUEM.includes(quem)) throw recusaMemoria('autor da versão desconhecido');
    await fs.mkdir(diretorio, { recursive: true, mode: 0o700 });
    return comTrava(diretorio, async () => {
      const atual = await leitor.ler();
      if (atual.estado === 'ilegivel') throw recusaMemoria(`${atual.motivo}; conserte o arquivo à mão antes de gravar`, 409);
      if (atual.hash !== base) throw recusaMemoria('a memória mudou desde o preparo; recarregue e prepare de novo', 409);
      if (atual.texto === texto) throw recusaMemoria('nada muda: o texto é igual ao atual');
      const diff = diffMemoria(atual.texto, texto);
      const quando = new Date(agora()).toISOString();
      const hashDepois = hashTexto(texto);
      // Quem editou o arquivo à mão quebra a corrente de hashes: a versão nova diz isso.
      const anterior = (await leitor.lerHistorico().catch(() => [])).filter(e => !e.evento).at(-1);
      const foraDoPainel = Boolean(anterior) ? anterior.hashDepois !== atual.hash : atual.estado !== 'ausente';
      const temporario = `${leitor.arquivo}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporario, texto, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        // O histórico vem antes do rename: queda entre os dois deixa versão registrada que
        // nunca virou atual (e o evento diz), nunca uma atual sem registro.
        await anexarJsonl(leitor.arquivoHistorico, { quando, quem, origem, usuarioId, motivo: motivo ? String(motivo).slice(0, 300) : null,
          hashAntes: atual.hash, hashDepois, bytes: bytesDe(texto), foraDoPainel, diff: diff.texto,
          linhasRemovidas: diff.linhasRemovidas, linhasAcrescentadas: diff.linhasAcrescentadas, antes: atual.texto, depois: texto });
        try { await renomear(temporario, leitor.arquivo); }
        catch (e) {
          await anexarJsonl(leitor.arquivoHistorico, { quando, evento: 'nunca-aplicada', hashDepois, motivo: e.code ?? e.message }).catch(() => {});
          throw new Error(`versão ${hashDepois.slice(0, 12)} da memória não aplicada (${e.code ?? e.message})`);
        }
      } finally { await fs.rm(temporario, { force: true }).catch(() => {}); }
      return { quando, quem, hashAntes: atual.hash, hash: hashDepois, bytes: bytesDe(texto), diff: diff.texto };
    });
  }

  return { gravar, leitor };
}
