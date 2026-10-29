// Linhas de um diário JSONL. A última linha sem quebra pode ser escrita interrompida:
// fica de fora e é sinalizada. Linha ruim no meio é corrupção: falha fechada.

export function lerJsonl(texto, nome = 'diário') {
  const partes = String(texto).split('\n');
  const terminaComQuebra = partes.at(-1) === '';
  if (terminaComQuebra) partes.pop();
  const linhas = [];
  let truncadaNoFim = false;
  for (let i = 0; i < partes.length; i += 1) {
    if (!partes[i].trim()) continue;
    try { linhas.push(JSON.parse(partes[i])); }
    catch {
      if (i === partes.length - 1 && !terminaComQuebra) { truncadaNoFim = true; continue; }
      throw new Error(`${nome} ilegível na linha ${i + 1}`);
    }
  }
  return { linhas, truncadaNoFim };
}
