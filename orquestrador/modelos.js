// A escolha explícita por carta/papel é vinculante para qualquer plano futuro.
// Este módulo não despacha nem substitui uma escolha indisponível por outra.
export const PAPEIS = Object.freeze(['orquestracao', 'codificacao_testes', 'validacao']);

export function catalogoModelos(contrato) {
  return (contrato?.agentes ?? []).map(a => ({
    provedor: a.provedor,
    modelo: a.modelo,
    esforcoPadrao: a.esforco === 'extreme high' ? 'xhigh' : a.esforco,
    esforcos: a.esforcos ?? [a.esforco === 'extreme high' ? 'xhigh' : a.esforco],
    disponivel: a.disponivel,
  }));
}

export function validarSelecoes(contrato, selecoes) {
  if (!selecoes || typeof selecoes !== 'object' || Array.isArray(selecoes)) throw new Error('seleções de IA inválidas');
  const opcoes = catalogoModelos(contrato);
  for (const papel of PAPEIS) {
    const escolha = selecoes[papel];
    if (!escolha || !opcoes.some(op => op.provedor === escolha.provedor &&
      op.modelo === escolha.modelo && op.esforcos.includes(escolha.esforco))) {
      throw new Error(`modelo ou esforço não permitido para ${papel}`);
    }
  }
  if (Object.keys(selecoes).some(p => !PAPEIS.includes(p))) throw new Error('papel de IA desconhecido');
  return Object.fromEntries(PAPEIS.map(p => [p, {
    provedor: selecoes[p].provedor, modelo: selecoes[p].modelo, esforco: selecoes[p].esforco,
  }]));
}

export function prepararPlanoExecucao(contrato, selecoes) {
  const validadas = validarSelecoes(contrato, selecoes);
  const papeis = {};
  for (const papel of PAPEIS) {
    const escolha = validadas[papel];
    const agente = contrato.agentes.find(a => a.provedor === escolha.provedor && a.modelo === escolha.modelo);
    if (!agente?.disponivel) throw new Error(`executor selecionado indisponível para ${papel}; sem fallback`);
    papeis[papel] = { ...escolha, agenteId: agente.id };
  }
  return Object.freeze({ papeis: Object.freeze(papeis), origem: 'selecao-explicita', fallback: false });
}

// Somente flags de modelo/esforço para uma futura CLI isolada. Não inclui
// prompt, permissão, cwd ou spawn: esses portões exigem prova separada.
export function argumentosModeloCli(contrato, selecoes, papel) {
  if (!PAPEIS.includes(papel)) throw new Error('papel de IA desconhecido');
  const { provedor, modelo, esforco } = prepararPlanoExecucao(contrato, selecoes).papeis[papel];
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(modelo) ||
      !['low', 'medium', 'high', 'xhigh', 'max'].includes(esforco)) {
    throw new Error('modelo ou esforço incompatível com CLI');
  }
  if (provedor === 'claude') return Object.freeze({ executavel: 'claude',
    argumentos: Object.freeze(['--model', modelo, '--effort', esforco]) });
  if (provedor === 'openai') return Object.freeze({ executavel: 'codex',
    argumentos: Object.freeze(['exec', '--model', modelo, '--config', `model_reasoning_effort=${esforco}`]) });
  throw new Error('provedor de CLI desconhecido');
}
