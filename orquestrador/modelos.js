// Plano de execução a partir da frota congelada e as flags de modelo/esforço de cada CLI. Sem fallback.
//
// A frota escolhe os modelos; o contrato do projeto continua sendo o interruptor (J1):
// cada provedor usado precisa de `agentes[].disponivel: true` no contrato. Modelo e
// esforço declarados em `agentes` são ignorados.
import { PAPEIS_EXECUTOR, tuplaNoCatalogo, validarBlocoExecutor } from './frota-catalogo.js';

export const PAPEIS = PAPEIS_EXECUTOR;

// Provedores que a frota usa e o contrato do projeto desligou (J1, J-E). A prontidão, a
// fila e a vigília usam isto antes de qualquer escrita; o plano recusa do mesmo jeito.
export function incompatibilidadesFrota(contrato, tuplas) {
  if (!tuplas) return [];
  const ligados = new Set((contrato?.agentes ?? []).filter(a => a.disponivel === true).map(a => a.provedor));
  return [...new Set(PAPEIS.map(p => tuplas[p]?.provedor).filter(p => p && !ligados.has(p)))]
    .map(p => `frota pede ${p} que o contrato desligou`);
}

export function prepararPlanoFrota(contrato, congelada) {
  if (!congelada || !Number.isInteger(congelada.versao)) throw new Error('frota não congelada; sem fallback');
  const tuplas = validarBlocoExecutor(congelada.tuplas);
  const papeis = {};
  for (const papel of PAPEIS) {
    const t = tuplas[papel];
    const agente = (contrato?.agentes ?? []).find(a => a.provedor === t.provedor && a.disponivel === true);
    if (!agente) throw new Error(`provedor ${t.provedor} desligado no contrato para ${papel}; a frota não liga projeto nem provedor`);
    papeis[papel] = Object.freeze({ ...t, agenteId: agente.id });
  }
  return Object.freeze({ papeis: Object.freeze(papeis), origem: 'frota',
    frota: Object.freeze({ versao: congelada.versao, hash: congelada.hash }), fallback: false });
}

// Somente flags de modelo/esforço. Não inclui prompt, permissão, cwd ou spawn.
export function argumentosModeloCli(plano, papel) {
  if (!PAPEIS.includes(papel)) throw new Error('papel de IA desconhecido');
  const escolha = plano?.papeis?.[papel];
  if (!tuplaNoCatalogo({ provedor: escolha?.provedor, modelo: escolha?.modelo, esforco: escolha?.esforco })) {
    throw new Error('modelo ou esforço fora do catálogo da frota');
  }
  const { provedor, modelo, esforco } = escolha;
  if (provedor === 'claude') return Object.freeze({ executavel: 'claude',
    argumentos: Object.freeze(['--model', modelo, '--effort', esforco]) });
  return Object.freeze({ executavel: 'codex',
    argumentos: Object.freeze(['exec', '--model', modelo, '--config', `model_reasoning_effort=${esforco}`]) });
}
