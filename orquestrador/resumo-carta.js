// Resumo da carta para a aba: o estado que a descrição declara (compactação do fio,
// PADROES-BACKLOG.md), o último handoff e gate, e o tamanho do fio. Sem LLM; o fio
// inteiro fica no Plane.

const LIMIAR_COMPACTAR = 8;

export function textoVisivel(html = '') {
  return (typeof html === 'string' ? html : '').replace(/<\/(?:p|div|li|h[1-6]|br)>|<br\s*\/>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

const cortar = (s, max) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

function bloco(linhas, rotulo) {
  const i = linhas.findIndex(l => new RegExp(`^${rotulo}\\b`, 'i').test(l.trim()));
  if (i < 0) return null;
  const fim = linhas.findIndex((l, j) => j > i && /^(Estado|Feito e decidido|Para ler)\b/i.test(l.trim()));
  return linhas.slice(i, fim < 0 ? i + 6 : fim).join('\n').trim();
}

const maisRecente = (lista) => [...lista].sort((a, b) => String(b.quando ?? '').localeCompare(String(a.quando ?? '')))[0] ?? null;

export function resumirCarta({ descricaoHtml = '', interacoes = [], handoffs = [], gates = [] }) {
  const texto = textoVisivel(descricaoHtml);
  const linhas = texto.split('\n').filter(l => l.trim());
  const estado = bloco(linhas, 'Estado');
  const compactacao = maisRecente(interacoes.filter(e => (e.texto ?? '').startsWith('COMPACTADO/v1')));
  const desde = compactacao ? interacoes.filter(e => String(e.quando) > String(compactacao.quando)).length : interacoes.length;
  const ultimo = maisRecente(interacoes);
  const h = maisRecente(handoffs);
  const g = maisRecente(gates);
  return {
    estado: estado ? cortar(estado, 600) : null,
    feito: bloco(linhas, 'Feito e decidido') ? cortar(bloco(linhas, 'Feito e decidido'), 600) : null,
    descricao: estado ? null : cortar(linhas.slice(0, 4).join('\n'), 400) || null,
    ultimoHandoff: h ? { papel: h.papel ?? null, resultado: h.resultado ?? null, resumo: cortar(String(h.resumo ?? ''), 300), quando: h.quando ?? null } : null,
    ultimoGate: g ? { gate: g.gate ?? null, quando: g.quando ?? null } : null,
    fio: {
      comentarios: interacoes.length,
      desdeCompactacao: desde,
      pedeCompactacao: desde >= LIMIAR_COMPACTAR,
      ultimo: ultimo ? { autor: ultimo.autor ?? null, quando: ultimo.quando ?? null } : null,
    },
  };
}
