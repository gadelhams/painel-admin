// Classifica impedimentos verificáveis de uma carta sem gate.
// Ausência de impedimento estrutural não é aceite do conteúdo.

export const CATEGORIAS_DEV = Object.freeze([
  { codigo: 'CARTA_PAI', nome: 'Carta-pai / épica', tipo: 'estrutura' },
  { codigo: 'RASCUNHO', nome: 'Rascunho', tipo: 'estrutura' },
  { codigo: 'ASTARGNE', nome: 'Intervenção humana indicada', tipo: 'revisao-humana' },
  { codigo: 'BLOQUEADA', nome: 'Bloqueio explícito', tipo: 'revisao-humana' },
  { codigo: 'ESCOPO_SUSPENSO', nome: 'Fora de escopo ou congelada', tipo: 'revisao-humana' },
  { codigo: 'POS_PLAYTEST', nome: 'Após playtest', tipo: 'revisao-humana' },
  { codigo: 'DEPENDENCIA_PENDENTE', nome: 'Dependência formal pendente', tipo: 'dependencia' },
  { codigo: 'DEPENDENCIA_INDISPONIVEL', nome: 'Relação ou alvo indisponível', tipo: 'dependencia' },
  { codigo: 'DEPENDENCIA_NAO_AUDITADA', nome: 'Dependências sem prova formal', tipo: 'dependencia' },
  { codigo: 'ESTADO_INADEQUADO', nome: 'Estado não adequado ao DEV', tipo: 'fluxo' },
  { codigo: 'CONTEUDO_A_REVISAR', nome: 'Escopo e aceite ainda não revisados', tipo: 'evidencia' },
]);

export function classificarProntidaoDev(carta, dependencias = []) {
  if (carta.filhos?.length) return ['CARTA_PAI'];
  const etiquetas = new Set((carta.labels ?? []).map(l => typeof l === 'string' ? l : l.name));
  const categorias = [];
  if (carta.is_draft) categorias.push('RASCUNHO');
  if (etiquetas.has('ASTARGNE') || /\((ASTARGNE|DONO)(?:[: )])/i.test(carta.description_html ?? '')) categorias.push('ASTARGNE');
  if (etiquetas.has('BLOQUEADA') || /\(BLOQUEADA(?:[: )])/i.test(carta.description_html ?? '')) categorias.push('BLOQUEADA');
  if (etiquetas.has('SEM ESCOPO') || etiquetas.has('CONGELADA')) categorias.push('ESCOPO_SUSPENSO');
  if (etiquetas.has('PÓS-PLAYTEST')) categorias.push('POS_PLAYTEST');
  if (dependencias.some(d => d.estado === 'pendente')) categorias.push('DEPENDENCIA_PENDENTE');
  if (dependencias.some(d => d.estado === 'desconhecida')) categorias.push('DEPENDENCIA_INDISPONIVEL');
  if (dependencias.some(d => !['concluida', 'pendente', 'desconhecida'].includes(d.estado))) categorias.push('DEPENDENCIA_NAO_AUDITADA');
  if (!['unstarted', 'started'].includes(carta.state?.group ?? carta.state?.type)) categorias.push('ESTADO_INADEQUADO');
  if (!categorias.length) categorias.push('CONTEUDO_A_REVISAR');
  return categorias;
}
