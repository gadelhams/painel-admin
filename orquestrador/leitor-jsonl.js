// Leitura e acréscimo de um diário JSONL. A última linha sem quebra pode ser escrita
// interrompida: fica de fora e é sinalizada. Linha ruim no meio é corrupção: falha fechada.
//
// O acréscimo (anexarJsonl) não cola o registro novo numa cauda interrompida: se o
// arquivo não termina em \n, grava \n antes e o registro sai com `_aposTruncada` como
// PRIMEIRA chave. Assim até uma escrita de recuperação interrompida é reconhecível pelo
// prefixo. Na leitura, uma linha ruim no meio só é tolerada quando a próxima linha
// começa com esse prefixo (é o resto de uma escrita interrompida que um acréscimo
// depois separou); o mesmo vale em cadeia, para a falha dupla (cauda cortada e, em
// seguida, a escrita de recuperação também cortada). Qualquer outra linha ruim no meio
// continua falhando fechada. A marca não sai para quem lê; `truncadasNoMeio` conta as
// linhas toleradas, para a perda deixar rastro.
import fs from 'node:fs/promises';

const MARCA = '_aposTruncada';
const PREFIXO = `{"${MARCA}":true`;

export function lerJsonl(texto, nome = 'diário') {
  const partes = String(texto).split('\n');
  const terminaComQuebra = partes.at(-1) === '';
  if (terminaComQuebra) partes.pop();
  const indices = partes.map((p, i) => i).filter(i => partes[i].trim());
  const linhas = [];
  let truncadaNoFim = false;
  let truncadasNoMeio = 0;
  for (let k = 0; k < indices.length; k += 1) {
    const i = indices[k];
    let linha;
    try { linha = JSON.parse(partes[i]); }
    catch {
      if (k === indices.length - 1 && i === partes.length - 1 && !terminaComQuebra) { truncadaNoFim = true; continue; }
      const proxima = indices[k + 1] !== undefined ? partes[indices[k + 1]] : null;
      if (proxima !== null && proxima.startsWith(PREFIXO)) { truncadasNoMeio += 1; continue; }
      throw new Error(`${nome} ilegível na linha ${i + 1}`);
    }
    if (linha && typeof linha === 'object' && MARCA in linha) { const { [MARCA]: _, ...resto } = linha; linha = resto; }
    linhas.push(linha);
  }
  return { linhas, truncadaNoFim, truncadasNoMeio };
}

async function terminaEmQuebra(arquivo) {
  let h;
  try { h = await fs.open(arquivo, 'r'); }
  catch (e) { if (e.code === 'ENOENT') return true; throw e; }
  try {
    const { size } = await h.stat();
    if (!size) return true;
    const b = Buffer.alloc(1);
    await h.read(b, 0, 1, size - 1);
    return b[0] === 0x0a;
  } finally { await h.close(); }
}

// Devolve true quando separou uma cauda interrompida (para quem quiser registrar o fato).
export async function anexarJsonl(arquivo, registro) {
  const inteiro = await terminaEmQuebra(arquivo);
  const linha = JSON.stringify(inteiro ? registro : { [MARCA]: true, ...registro });
  await fs.appendFile(arquivo, `${inteiro ? '' : '\n'}${linha}\n`, 'utf8');
  return !inteiro;
}
