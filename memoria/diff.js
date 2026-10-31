// Diff unificado curto, linha a linha, entre duas versões da memória L1, com a conta do que foi apagado. Não lê nem grava arquivo.
//
// A memória tem teto de 8 KB: LCS direto basta. Prefixo e sufixo comuns saem antes; se o
// miolo ainda for grande demais para a tabela, o diff vira "tudo trocado" (honesto e
// conservador: conta como apagado, e a reflexão cai para proposta pendente).

const MAX_CELULAS = 2_000_000;
const MAX_DIFF = 4_000;

const linhasDe = texto => (texto === '' ? [] : String(texto).replace(/\n$/, '').split('\n'));

function operacoes(a, b) {
  let ini = 0;
  while (ini < a.length && ini < b.length && a[ini] === b[ini]) ini += 1;
  let fimA = a.length;
  let fimB = b.length;
  while (fimA > ini && fimB > ini && a[fimA - 1] === b[fimB - 1]) { fimA -= 1; fimB -= 1; }
  const ops = a.slice(0, ini).map(l => ({ t: ' ', l }));
  const ma = a.slice(ini, fimA);
  const mb = b.slice(ini, fimB);
  if (ma.length * mb.length > MAX_CELULAS) {
    ops.push(...ma.map(l => ({ t: '-', l })), ...mb.map(l => ({ t: '+', l })));
  } else {
    // Tabela de sufixos: lcs[i][j] = LCS de ma[i..] e mb[j..].
    const lcs = Array.from({ length: ma.length + 1 }, () => new Uint32Array(mb.length + 1));
    for (let i = ma.length - 1; i >= 0; i -= 1) {
      for (let j = mb.length - 1; j >= 0; j -= 1) lcs[i][j] = ma[i] === mb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
    let i = 0;
    let j = 0;
    while (i < ma.length || j < mb.length) {
      if (i < ma.length && j < mb.length && ma[i] === mb[j]) { ops.push({ t: ' ', l: ma[i] }); i += 1; j += 1; }
      // Na dúvida, apaga antes de acrescentar: o "-" vem antes do "+", como no diff de sempre.
      else if (i < ma.length && (j === mb.length || lcs[i + 1][j] >= lcs[i][j + 1])) { ops.push({ t: '-', l: ma[i] }); i += 1; }
      else { ops.push({ t: '+', l: mb[j] }); j += 1; }
    }
  }
  ops.push(...a.slice(fimA).map(l => ({ t: ' ', l })));
  return ops;
}

// Blocos @@ com `contexto` linhas em volta de cada mudança.
function unificado(ops, contexto) {
  const mudou = ops.map(o => o.t !== ' ');
  const perto = ops.map((_, k) => mudou.slice(Math.max(0, k - contexto), k + contexto + 1).some(Boolean));
  const saida = [];
  let na = 1;
  let nb = 1;
  let k = 0;
  while (k < ops.length) {
    if (!perto[k]) { if (ops[k].t !== '+') na += 1; if (ops[k].t !== '-') nb += 1; k += 1; continue; }
    const iniA = na;
    const iniB = nb;
    const corpo = [];
    while (k < ops.length && perto[k]) {
      corpo.push(`${ops[k].t}${ops[k].l}`);
      if (ops[k].t !== '+') na += 1;
      if (ops[k].t !== '-') nb += 1;
      k += 1;
    }
    saida.push(`@@ -${iniA},${na - iniA} +${iniB},${nb - iniB} @@`, ...corpo);
  }
  return saida.join('\n');
}

export function diffMemoria(antes, depois, { contexto = 2, max = MAX_DIFF } = {}) {
  const ops = operacoes(linhasDe(antes), linhasDe(depois));
  const removidas = ops.filter(o => o.t === '-');
  const acrescentadas = ops.filter(o => o.t === '+');
  // Caracteres das linhas apagadas, com a quebra de cada uma, contra o texto anterior inteiro.
  const apagados = removidas.reduce((s, o) => s + o.l.length + 1, 0);
  const base = String(antes).length;
  let texto = unificado(ops, contexto);
  const truncado = texto.length > max;
  if (truncado) texto = `${texto.slice(0, max)}\n… (diff truncado)`;
  return { texto, truncado, linhasRemovidas: removidas.length, linhasAcrescentadas: acrescentadas.length,
    fracaoApagada: base ? Math.min(1, apagados / base) : 0 };
}
