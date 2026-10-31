// Única escrita da memória L1: confere a base sob trava, registra a versão no histórico e troca o arquivo de uma vez. Não confere SSO nem decide se a mudança é boa.
//
// Só dois caminhos chegam aqui (invariante 4 em docs/invariants.md): a API do dono
// (api-memoria.js, SSO + duas ações) e a reflexão noturna (reflexao.js, com diário). O
// motor do C-3PO nunca, nem por transitividade (test/fronteiras-modulos.test.js).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl } from '../orquestrador/leitor-jsonl.js';
import { comTravaDiretorio } from './trava.js';
import { criarLeitorMemoria, foraDoPainel as editadaFora, situarVersoes, DIRETORIO_C3PO, TETO_BYTES, bytesDe, hashTexto } from './arquivo-memoria.js';
import { diffMemoria } from './diff.js';

export const QUEM = Object.freeze(['dono', 'reflexao', 'proposta-aceita']);
const TRAVA_VELHA_MS = 60_000;
const ESPERA_TRAVA_MS = 5_000;

// Recusa que provadamente não gravou nada; o status vai para a resposta HTTP.
export const recusaMemoria = (mensagem, status = 422) => Object.assign(new Error(mensagem), { semEscrita: true, status });

// Trava entre processos (o painel e a reflexão do timer), em trava.js. Uma trava mais velha
// que 60 s é de processo que caiu no meio e é recuperada por rename (um só recupera).
const comTrava = (diretorio, fn) => comTravaDiretorio(path.join(diretorio, '.memoria.trava'), fn, { velhaMs: TRAVA_VELHA_MS,
  esperaMs: ESPERA_TRAVA_MS, ocupada: () => { throw recusaMemoria('a memória está sendo gravada por outro processo; tente de novo', 409); } });

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
      // Versão que ficou sem desfecho (queda entre o histórico e o rename) se reconcilia agora,
      // sob a trava, pelo hash do arquivo; só então se sabe se houve edição à mão.
      const situadas = situarVersoes((await leitor.lerHistoricoComDefeito().catch(() => ({ linhas: [] }))).linhas, atual.hash);
      if (situadas.reconciliar) {
        await anexarJsonl(leitor.arquivoHistorico, { quando, evento: situadas.reconciliar, versaoId: situadas.ultima.id ?? null,
          hashDepois: situadas.ultima.hashDepois, reconciliada: true });
      }
      const foraDoPainel = editadaFora(situadas, atual);
      const versaoId = randomUUID();
      const temporario = `${leitor.arquivo}.${randomUUID()}.tmp`;
      try {
        await fs.writeFile(temporario, texto, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        // O histórico vem antes do rename, como `pendente`: queda entre os dois deixa versão
        // sem desfecho, que a próxima gravação reconcilia — nunca uma atual sem registro.
        await anexarJsonl(leitor.arquivoHistorico, { quando, id: versaoId, rename: 'pendente', quem, origem, usuarioId,
          motivo: motivo ? String(motivo).slice(0, 300) : null,
          hashAntes: atual.hash, hashDepois, bytes: bytesDe(texto), foraDoPainel, diff: diff.texto,
          linhasRemovidas: diff.linhasRemovidas, linhasAcrescentadas: diff.linhasAcrescentadas, antes: atual.texto, depois: texto });
        try { await renomear(temporario, leitor.arquivo); }
        catch (e) {
          await anexarJsonl(leitor.arquivoHistorico, { quando, evento: 'nunca-aplicada', versaoId, hashDepois, motivo: e.code ?? e.message }).catch(() => {});
          throw new Error(`versão ${hashDepois.slice(0, 12)} da memória não aplicada (${e.code ?? e.message})`);
        }
        // Se este evento se perder, a próxima leitura acha o arquivo = hashDepois e reconcilia.
        await anexarJsonl(leitor.arquivoHistorico, { quando, evento: 'aplicada', versaoId, hashDepois }).catch(() => {});
      } finally { await fs.rm(temporario, { force: true }).catch(() => {}); }
      return { quando, quem, hashAntes: atual.hash, hash: hashDepois, bytes: bytesDe(texto), diff: diff.texto };
    });
  }

  return { gravar, leitor };
}
