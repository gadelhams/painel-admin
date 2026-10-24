import { PAPEIS, validarSelecoes } from './modelos.js';

const GATES = ['READY TO DEV', 'READY TO TEST'];
const BLOQUEIOS = ['ASTARGNE', 'BLOQUEADA', 'CONGELADA', 'SEM ESCOPO', 'PÓS-PLAYTEST'];
// Substring, não palavra inteira: `deployment.mjs` e `dockerize.mjs` são tão proibidos
// quanto `deploy`; a checagem é estática e conservadora por desenho.
const PROIBIDO_NESTA_VERSAO = /(steam|proton|bannerlord|launcher|playtest|deploy|docker|ssh)/i;
// Mesma gramática do plane.js: a anotação legada `(DONO …)` e a variante `(ASTARGNE, …)`
// também são decisão humana, como a triagem e a aba Decisões já as leem.
const DECISAO_HUMANA_NA_DESCRICAO = /\((ASTARGNE|DONO|BLOQUEADA)(?![\p{L}])/iu;
const ESFORCOS = ['low', 'medium', 'high', 'xhigh', 'max'];
const SCRIPT_NODE = /^scripts\/[A-Za-z0-9][A-Za-z0-9._-]*\.mjs$/;
const SCRIPT_PYTHON = /^scripts\/[A-Za-z0-9][A-Za-z0-9._-]*\.py$/;

export function comandoEstaticoSeguro(comando) {
  if (!comando || !/^[a-z][a-z0-9-]*$/.test(comando.id ?? '') ||
      !['node', 'npm', 'python', 'python3'].includes(comando.executavel) ||
      !Array.isArray(comando.argumentos) || comando.argumentos.some(x => typeof x !== 'string') ||
      PROIBIDO_NESTA_VERSAO.test([comando.executavel, ...comando.argumentos].join(' '))) return false;
  const a = comando.argumentos;
  if (comando.executavel === 'npm') return a.length === 1 && a[0] === 'test';
  if (comando.executavel === 'node') return (a.length === 1 && SCRIPT_NODE.test(a[0]) && !a[0].includes('..')) ||
    (a.length === 2 && a[0] === '--test' && SCRIPT_NODE.test(a[1]) && a[1].endsWith('.test.mjs') && !a[1].includes('..'));
  return a.length === 1 && SCRIPT_PYTHON.test(a[0]) && !a[0].includes('..');
}

export function validarContrato(valor, projectId) {
  const erros = [];
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return ['contrato inválido'];
  if (valor.versao !== 1 || valor.optIn !== true) erros.push('contrato sem opt-in válido');
  if (valor.projetoPlane !== projectId) erros.push('id do projeto Plane não confere');
  if (!['offline', 'local'].includes(valor.ambiente)) erros.push('ambiente inválido');
  if (!Array.isArray(valor.tiposTeste) || !valor.tiposTeste.length || valor.tiposTeste.some(x => typeof x !== 'string' || !x.trim())) erros.push('tipos de teste ausentes');
  if (!Array.isArray(valor.criteriosAceite) || !valor.criteriosAceite.length || valor.criteriosAceite.some(x => typeof x !== 'string' || !x.trim())) erros.push('critérios de aceite ausentes');
  if (!Array.isArray(valor.acoesProibidas) || !valor.acoesProibidas.length || valor.acoesProibidas.some(x => typeof x !== 'string' || !x.trim())) erros.push('ações proibidas ausentes');
  if (!Array.isArray(valor.comandos) || !valor.comandos.length ||
      valor.comandos.some(c => !comandoEstaticoSeguro(c)) ||
      new Set(valor.comandos.map(c => c?.id)).size !== valor.comandos.length) erros.push('comandos permitidos inválidos');
  if (!Array.isArray(valor.agentes) || !valor.agentes.length || valor.agentes.some(a =>
    !a || typeof a.id !== 'string' || !a.id.trim() ||
    !['claude', 'openai'].includes(a.provedor) || typeof a.modelo !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(a.modelo) || typeof a.disponivel !== 'boolean' ||
    a.esforco !== (a.provedor === 'claude' ? 'max' : 'extreme high') ||
    (a.esforcos !== undefined && (!Array.isArray(a.esforcos) || !a.esforcos.length ||
      a.esforcos.some(e => !ESFORCOS.includes(e)) ||
      !a.esforcos.includes(a.esforco === 'extreme high' ? 'xhigh' : a.esforco)))
  ) || new Set(valor.agentes.map(a => a?.id)).size !== valor.agentes.length ||
    new Set(valor.agentes.map(a => `${a?.provedor}/${a?.modelo}`)).size !== valor.agentes.length
  ) erros.push('agentes/modelos/esforço inválidos');
  if (!erros.length) erros.push(...errosDaVigilia(valor));
  return erros;
}

// Vigília (24/10/2026, decisão do dono): varredura automática do projeto. O bloco é opcional
// e só vale com todos os freios declarados ou nos padrões; sem ele o projeto não entra em
// vigília. `perfilPadrao` é o perfil gravado no card quando a carta não tem PERFIL-IA/v1.
export const VIGILIA_PADRAO = Object.freeze({ maxTentativasPorCarta: 2, tetoPorDia: 6, pausaPorLimiteMinutos: 60 });
const LIMITES_VIGILIA = { maxTentativasPorCarta: [1, 5], tetoPorDia: [1, 50], pausaPorLimiteMinutos: [5, 1440] };

export function errosDaVigilia(contrato) {
  const v = contrato?.vigilia;
  if (v === undefined) return [];
  if (!v || typeof v !== 'object' || Array.isArray(v)) return ['vigilia: bloco inválido'];
  const erros = [];
  try { validarSelecoes(contrato, v.perfilPadrao); } catch (e) { erros.push(`vigilia.perfilPadrao: ${e.message}`); }
  for (const [chave, [min, max]] of Object.entries(LIMITES_VIGILIA)) {
    if (v[chave] !== undefined && !(Number.isInteger(v[chave]) && v[chave] >= min && v[chave] <= max)) erros.push(`vigilia.${chave} fora de ${min}..${max}`);
  }
  if (v.comando !== undefined && !contrato.comandos?.some(c => c.id === v.comando)) erros.push('vigilia.comando não está nos comandos do contrato');
  const extras = Object.keys(v).filter(k => !['perfilPadrao', 'comando', ...Object.keys(LIMITES_VIGILIA)].includes(k));
  if (extras.length) erros.push(`vigilia: campos desconhecidos ${extras.join(', ')}`);
  return erros;
}

// Configuração efetiva (padrões aplicados) ou null quando o contrato não declara vigília.
export function configuracaoVigilia(contrato) {
  if (!contrato?.vigilia || errosDaVigilia(contrato).length) return null;
  const v = contrato.vigilia;
  return Object.freeze({ ...VIGILIA_PADRAO, ...Object.fromEntries(Object.keys(LIMITES_VIGILIA).filter(k => v[k] !== undefined).map(k => [k, v[k]])),
    comando: v.comando ?? contrato.comandos[0].id,
    perfilPadrao: Object.freeze(Object.fromEntries(PAPEIS.map(p => [p, { provedor: v.perfilPadrao[p].provedor, modelo: v.perfilPadrao[p].modelo, esforco: v.perfilPadrao[p].esforco }]))) });
}

export function comandoPermitido(contrato, id) {
  const comando = contrato?.comandos?.find(c => c.id === id);
  if (!comandoEstaticoSeguro(comando)) {
    throw new Error('comando proibido ou ausente do contrato');
  }
  return comando;
}

// Gate é evidência de prontidão do trabalho, não permissão de despachar.
// Por isso ausência de executor/contrato não impede registrar o gate, mas
// permanece como impedimento explícito na elegibilidade de execução.
export function avaliarProntidaoGate(carta, { gate, dependencias = [], lease = null, erroEstado = null } = {}) {
  const motivos = [];
  const nomes = (carta.labels ?? []).map(l => typeof l === 'string' ? l : l.name).filter(Boolean);
  const grupos = carta.state?.group ?? carta.state?.type;
  if (!GATES.includes(gate)) motivos.push('gate inválido');
  if (carta.filhos?.length) motivos.push('não é folha executável');
  if (carta.is_draft) motivos.push('rascunho');
  if (gate === 'READY TO DEV' && !['unstarted', 'started'].includes(grupos)) motivos.push('estado inadequado para desenvolvimento');
  if (gate === 'READY TO TEST' && grupos !== 'started') motivos.push('estado inadequado para teste');
  const gatesAtuais = GATES.filter(g => nomes.includes(g));
  if (gatesAtuais.length > 1) motivos.push('dois gates de prontidão');
  if (gatesAtuais.length === 1 && gatesAtuais[0] !== gate) motivos.push('troca de gate exige decisão humana registrada');
  for (const marca of BLOQUEIOS) if (nomes.includes(marca)) motivos.push(`marcador ${marca} exige decisão humana`);
  if (DECISAO_HUMANA_NA_DESCRICAO.test(carta.description_html ?? '')) motivos.push('decisão ou bloqueio humano descrito na carta');
  if (/bloquead|blocked|em espera|aguardando/i.test(carta.state?.name ?? '')) motivos.push('estado bloqueado');
  for (const d of dependencias) if (d.estado !== 'concluida') motivos.push(`dependência ${d.id ?? '?'}: ${d.motivo ?? d.estado}`);
  if (lease) motivos.push('tentativa ou lease existente exige revisão antes de alterar gate');
  if (erroEstado) motivos.push(`estado operacional ilegível: ${erroEstado}`);
  return { pronta: motivos.length === 0, motivos, gate, gatesAtuais };
}

// `agora` é um instante (número), não a função: com `Date.now` sem parênteses toda comparação
// de prazo dava falso e um lease ativo aparecia como 'revisão' sem motivo (achado de 24/10/2026).
export function avaliarCarta(carta, { contrato, errosContrato = [], dependencias = [], lease = null, historico = [], erroEstado = null, agora = Date.now() } = {}) {
  const motivos = [];
  const nomes = (carta.labels ?? []).map(l => typeof l === 'string' ? l : l.name).filter(Boolean);
  const descricao = carta.description_html ?? '';
  const gates = GATES.filter(g => nomes.includes(g));
  if (carta.filhos?.length) motivos.push('não é folha executável');
  if (carta.is_draft) motivos.push('rascunho');
  if (gates.length !== 1) motivos.push(gates.length ? 'dois gates de prontidão' : 'sem gate de prontidão');
  const grupo = carta.state?.group ?? carta.state?.type;
  if (gates[0] === 'READY TO DEV' && !['unstarted', 'started'].includes(grupo)) motivos.push('estado inadequado para desenvolvimento');
  if (gates[0] === 'READY TO TEST' && grupo !== 'started') motivos.push('estado inadequado para teste');
  if (gates.length === 0 && !['unstarted', 'started'].includes(grupo)) motivos.push('estado não executável');
  for (const marca of BLOQUEIOS) if (nomes.includes(marca)) motivos.push(`marcador ${marca} exige decisão humana`);
  if (DECISAO_HUMANA_NA_DESCRICAO.test(descricao) && !nomes.some(x => x === 'ASTARGNE' || x === 'BLOQUEADA')) motivos.push('decisão ou bloqueio humano descrito na carta');
  if (/bloquead|blocked|em espera|aguardando/i.test(carta.state?.name ?? '')) motivos.push('estado bloqueado');
  if (!contrato) motivos.push('contrato local ausente');
  else motivos.push(...errosContrato.map(x => `contrato: ${x}`));
  for (const d of dependencias) if (d.estado !== 'concluida') motivos.push(`dependência ${d.id ?? '?'}: ${d.motivo ?? d.estado}`);
  if (lease && Date.parse(lease.expiraEm) > agora) motivos.push(`lease ativo de ${lease.agente ?? 'outro agente'}`);
  if (lease?.modoReal === true && Date.parse(lease.expiraEm) <= agora) motivos.push('execução inconclusa; lease vencido exige revisão humana');
  if (lease && !Number.isFinite(Date.parse(lease.expiraEm))) motivos.push('lease ilegível');
  if (erroEstado) motivos.push(`estado operacional ilegível: ${erroEstado}`);
  const agentesDisponiveis = contrato && !errosContrato.length && Array.isArray(contrato.agentes)
    ? contrato.agentes.filter(a => a.disponivel) : [];
  const agente = agentesDisponiveis[0] ?? null; // compatibilidade do adaptador legado; não é atribuição.
  if (!agente) motivos.push('nenhum agente elegível');
  const tentativa = [...historico].reverse().find(x => x.tipo === 'TENTATIVA' || x.tipo === 'RESULTADO') ?? null;
  const leaseSituacao = !lease ? 'livre' : !Number.isFinite(Date.parse(lease.expiraEm)) ? 'ilegível' : Date.parse(lease.expiraEm) > agora ? 'ativo' : lease.modoReal === true ? 'revisão' : 'expirado';
  return { elegivel: motivos.length === 0, motivos, gate: gates.length === 1 ? gates[0] : null,
    agente, agentesDisponiveis: agentesDisponiveis.map(a => ({ id: a.id, modelo: a.modelo, esforco: a.esforco })),
    tentativa, lease, leaseSituacao, historico };
}
