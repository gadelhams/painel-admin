// Visão de decisões para o C-3PO (24/10/2026, pedido do dono): a mesma
// classificação da aba Decisões e do bloco "Astargne", em texto para a conversa
// — o que depende do dono, o que está bloqueado e por quê, o que espera terceiros.
// Só leitura; nunca escreve no Plane.
const TAGS_DONO = new Set(['ASTARGNE', 'EMPÍRICA']);
const RE_TERCEIRO = /\b(autor|felipe|feljin|colaborador|provedor|samsung|amazon|google|youtubei)\b/i;
const RE_PUSH = /\b(push|deploy|publicar|sudo|instalar|borda|unit de usu)/i;

export function resumirDecisoes({ decisoes, projetos = [], chaves = { pendentes: [], rotacoesFeitas: [] }, foco = null, limite = 60 }) {
  const congelados = new Set(projetos.filter((p) => p.congelado).map((p) => p.pasta));
  const titulo = (pasta) => projetos.find((p) => p.pasta === pasta)?.titulo ?? pasta;
  const feitas = new Map((chaves.rotacoesFeitas ?? []).map((f) => [f.card, f]));
  const cardsDeChave = new Set((chaves.pendentes ?? []).map((c) => c.card));
  const abertas = decisoes.filter((d) => d.estado === 'aberto' && !congelados.has(d.projeto) && (!foco || d.projeto === foco || d.identificador === foco));
  const vistos = new Set();
  const linha = (d) => `${d.identificador ?? '—'} [${titulo(d.projeto)}] ${d.texto}${d.detalhe ? ` — ${String(d.detalhe).replace(/<[^>]+>/g, '')}` : ''}`;
  const grupos = { dono_chaves: [], dono_push: [], dono_provas: [], dono_produto: [], rotacao_registrada: [], bloqueada_pelo_dono: [], bloqueada_por_terceiro: [], bloqueada_outra: [], pos_playtest: 0, sem_escopo: [] };
  for (const d of abertas) {
    const chave = `${d.identificador}|${d.tag}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const detalhe = String(d.detalhe ?? '');
    if (TAGS_DONO.has(d.tag)) {
      if (feitas.has(d.identificador)) grupos.rotacao_registrada.push(linha(d));
      else if (cardsDeChave.has(d.identificador)) grupos.dono_chaves.push(linha(d));
      else if (RE_PUSH.test(d.texto)) grupos.dono_push.push(linha(d));
      else if (d.tag === 'EMPÍRICA') grupos.dono_provas.push(linha(d));
      else grupos.dono_produto.push(linha(d));
    } else if (d.tag === 'BLOQUEADA') {
      if (/\b(dono|astargne|vai\b|aceite)/i.test(detalhe)) grupos.bloqueada_pelo_dono.push(linha(d));
      else if (RE_TERCEIRO.test(detalhe)) grupos.bloqueada_por_terceiro.push(linha(d));
      else grupos.bloqueada_outra.push(linha(d));
    } else if (d.tag === 'PÓS-PLAYTEST') grupos.pos_playtest += 1;
    else if (d.tag === 'SEM ESCOPO') grupos.sem_escopo.push(linha(d));
  }
  const corta = (l) => (l.length > limite ? [...l.slice(0, limite), `… e mais ${l.length - limite}`] : l);
  return {
    atualizadoEm: new Date().toISOString(),
    projetosCongeladosIgnorados: [...congelados],
    leitura: 'Grupos "dono_*" dependem de Astargne; "bloqueada_pelo_dono" são cadeias que uma decisão dele destrava; "bloqueada_por_terceiro" esperam outra pessoa ou fornecedor; "rotacao_registrada" já foi feita na aba Chaves e o card só espera o orquestrador fechar. O vínculo entre cards vem do texto do detalhe da etiqueta — não é um grafo formal.',
    totais: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, Array.isArray(v) ? v.length : v])),
    grupos: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, Array.isArray(v) ? corta(v) : v])),
  };
}
