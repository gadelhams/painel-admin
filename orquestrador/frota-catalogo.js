// Catálogo fechado da frota (provedor → modelo → esforços) e os validadores dos dois blocos. Não lê nem grava arquivo.
//
// O catálogo mora no código de propósito (J6 do parecer de 29/10/2026): o navegador
// nunca acrescenta modelo. O `max` do OpenAI não foi verificado na CLI, por isso fica fora.

export const PAPEIS_EXECUTOR = Object.freeze(['orquestracao', 'codificacao_testes', 'validacao']);
export const PAPEIS_ZELADOR = Object.freeze(['zelador']);

export const CATALOGO_FROTA = Object.freeze({
  claude: Object.freeze({ 'claude-opus-5': Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']) }),
  openai: Object.freeze({ 'gpt-6-astra': Object.freeze(['low', 'medium', 'high', 'xhigh']) }),
});

const NOMES_PROVEDOR = { claude: 'Claude', openai: 'OpenAI' };

// Forma que os seletores do navegador já entendem (modelos-seletores.js).
export function catalogoPublico() {
  return Object.entries(CATALOGO_FROTA).flatMap(([provedor, modelos]) => Object.entries(modelos).map(([modelo, esforcos]) => ({
    provedor, nome: NOMES_PROVEDOR[provedor], modelo, esforcos: [...esforcos], esforcoPadrao: esforcos.at(-1), disponivel: true,
  })));
}

const objetoSimples = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export function tuplaNoCatalogo(t) {
  return objetoSimples(t) && Object.keys(t).sort().join(',') === 'esforco,modelo,provedor' &&
    Object.hasOwn(CATALOGO_FROTA, t.provedor) && Object.hasOwn(CATALOGO_FROTA[t.provedor], t.modelo) &&
    CATALOGO_FROTA[t.provedor][t.modelo].includes(t.esforco);
}

function validarTupla(t, papel) {
  if (!tuplaNoCatalogo(t)) throw new Error(`modelo ou esforço fora do catálogo para ${papel}`);
  return Object.freeze({ provedor: t.provedor, modelo: t.modelo, esforco: t.esforco });
}

// Cada bloco tem a própria lista fechada de papéis: o executor nunca recebe o papel
// zelador nem o zelador um papel do executor (J8).
function validarBloco(bloco, papeis, nome) {
  if (!objetoSimples(bloco)) throw new Error(`bloco ${nome} da frota ausente ou inválido`);
  const estranhos = Object.keys(bloco).filter(p => !papeis.includes(p));
  if (estranhos.length) throw new Error(`papel ${estranhos.join(', ')} não pertence ao bloco ${nome}`);
  return Object.freeze(Object.fromEntries(papeis.map(p => [p, validarTupla(bloco[p], p)])));
}

export const validarBlocoExecutor = bloco => validarBloco(bloco, PAPEIS_EXECUTOR, 'executor');
export const validarBlocoZelador = bloco => validarBloco(bloco, PAPEIS_ZELADOR, 'zelador');

export function validarConteudoFrota(conteudo) {
  if (!objetoSimples(conteudo)) throw new Error('frota inválida');
  const estranhos = Object.keys(conteudo).filter(k => !['executor', 'zelador'].includes(k));
  if (estranhos.length) throw new Error(`bloco desconhecido na frota: ${estranhos.join(', ')}`);
  return Object.freeze({ executor: validarBlocoExecutor(conteudo.executor), zelador: validarBlocoZelador(conteudo.zelador) });
}
