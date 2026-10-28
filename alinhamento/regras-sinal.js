// Regras que o sinal de um projeto aplica. Não varrem o disco.

export const REGRA_DESDE = '2026-10-25T00:00:00Z';
export const ATRASO_DOC_DIAS = 7;
export const RE_CARTA = /\b([A-Z]{2,8})-(\d{1,5})\b/g;
const RE_DATA_BR = /(\d{2})\/(\d{2})\/(\d{4})/;

export const CANDIDATOS_DOCS = {
  funcional: ['docs/00_PLANO.md', 'README.md', 'readme.md'],
  arquitetural: ['docs/arquitetura.md', 'docs/development/ARCHITECTURE.md', 'docs/ARCHITECTURE.md', 'docs/adr/README.md'],
  tecnica: ['docs/codigo.md', 'docs/current.md', 'docs/development/API.md'],
  contrato: ['AGENTS.md', 'CLAUDE.md'],
};

export function dataDoCabecalho(texto) {
  const m = RE_DATA_BR.exec(texto.split('\n', 3).join('\n'));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}
