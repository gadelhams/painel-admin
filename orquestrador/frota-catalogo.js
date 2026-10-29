// Catálogo fechado da frota (provedor → modelo → esforços) e os validadores dos dois blocos. Não lê nem grava arquivo.
//
// O catálogo mora no código de propósito (J6 do parecer de 29/10/2026): o navegador
// nunca acrescenta modelo. Fonte de cada linha, conferida em 29/10/2026: o registro de
// modelos do `claude` 2.1.284 (capacidades effort/xhigh_effort/max_effort) e o
// `~/.codex/models_cache.json` do codex-cli 0.162.1 (modelos `list` da conta e os níveis
// que cada um aceita). Atualizar a CLI pode trazer modelo novo: ele entra aqui, à mão.

export const PAPEIS_EXECUTOR = Object.freeze(['orquestracao', 'codificacao_testes', 'validacao']);
export const PAPEIS_ZELADOR = Object.freeze(['zelador']);

const CLAUDE = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const OPENAI = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const OPENAI_ULTRA = Object.freeze([...OPENAI, 'ultra']);

export const CATALOGO_FROTA = Object.freeze({
  claude: Object.freeze({
    'claude-opus-5-5': CLAUDE, 'claude-fable-5-1': CLAUDE, 'claude-sonnet-5-5': CLAUDE,
    'claude-opus-5': CLAUDE, 'claude-sonnet-5': CLAUDE,
  }),
  openai: Object.freeze({
    'gpt-6.1-sol': OPENAI_ULTRA, 'gpt-6.1-terra': OPENAI_ULTRA, 'gpt-6-astra': OPENAI_ULTRA, 'gpt-6-sol': OPENAI_ULTRA,
    'gpt-6-luna': OPENAI, 'gpt-5.6-sol': OPENAI_ULTRA, 'gpt-5.6-terra': OPENAI_ULTRA, 'gpt-5.6-luna': OPENAI,
  }),
});

const NOMES_PROVEDOR = { claude: 'Claude', openai: 'OpenAI' };

// Forma que os seletores do navegador já entendem (modelos-seletores.js). O padrão segue
// `max`: o `ultra` do OpenAI só entra por escolha explícita.
export function catalogoPublico() {
  return Object.entries(CATALOGO_FROTA).flatMap(([provedor, modelos]) => Object.entries(modelos).map(([modelo, esforcos]) => ({
    provedor, nome: NOMES_PROVEDOR[provedor], modelo, esforcos: [...esforcos], esforcoPadrao: esforcos.includes('max') ? 'max' : esforcos.at(-1), disponivel: true,
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
