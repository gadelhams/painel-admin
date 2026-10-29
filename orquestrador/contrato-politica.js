// Gramática do contrato opt-in: o que o projeto permite executar.

import { errosDaVigilia } from './vigilia-politica.js';

const PROIBIDO_NESTA_VERSAO = /(steam|proton|bannerlord|launcher|playtest|deploy|docker|ssh)/i;
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

// O que o contrato ainda declara mas a frota decide (J1): mostrado como aviso, nunca usado.
export function avisosDoContrato(contrato) {
  const avisos = [];
  if (Array.isArray(contrato?.agentes) && contrato.agentes.length) {
    avisos.push('agentes[]: modelo e esforço ignorados, a frota manda; só disponivel (por provedor) liga o projeto');
  }
  if (contrato?.vigilia?.perfilPadrao !== undefined) avisos.push('vigilia.perfilPadrao ignorado: a frota manda');
  return avisos;
}

export function comandoPermitido(contrato, id) {
  const comando = contrato?.comandos?.find(c => c.id === id);
  if (!comandoEstaticoSeguro(comando)) {
    throw new Error('comando proibido ou ausente do contrato');
  }
  return comando;
}
