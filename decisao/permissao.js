// Quais projetos a mesa de decisão abre: os do catálogo com Plane e sigla, menos os congelados, o Anya e o CKBL (recusados pelo id do projeto, não pela sigla). Não lê o Plane.
//
// A lista deriva de projetos.js (a mesma fonte do Hangar): projeto novo no catálogo entra
// sozinho. O Anya fica fora porque lá o Plane é espelho do Linear — o que a mesa gravasse
// seria sobrescrito (PADROES-BACKLOG.md); o CKBL porque o AGENTS.md dele só aceita no Plane as
// identidades Codex/Claude e a ponte REST (decisão do integrador, 31/10/2026). A recusa é por
// id para sobreviver a troca de sigla.
import { PROJETOS } from '../projetos.js';
import { ErroAcesso } from '../orquestrador/sso.js';

export const ANYA_PLANE_ID = '56104829-419b-4ad7-be84-2858f22c5617';
export const CKBL_PLANE_ID = '7ce26c40-6e46-49a8-9a7d-bf06bbda6542';
const FORA = new Set([ANYA_PLANE_ID, CKBL_PLANE_ID]);
const IDENTIFICADOR = /^([A-Z][A-Z0-9]{0,9})-([1-9]\d{0,6})$/;

// Recusa nomeada da mesa: a fronteira das duas ações devolve a mensagem (que é nossa, nunca
// dado do Plane) com o status, em vez da falha genérica.
export class RecusaMesa extends ErroAcesso {
  constructor(mensagem, status = 422) { super(mensagem, status); }
}

export function projetosDaMesa(catalogo = PROJETOS) {
  return catalogo.filter(p => p.plane && p.sigla && !p.congelado && !FORA.has(p.plane))
    .map(p => ({ pasta: p.pasta, titulo: p.titulo, sigla: p.sigla, projetoId: p.plane }));
}

// SIGLA-N → { projeto, sigla, numero }. O projeto vem do catálogo, nunca do pedido.
export function cartaDaMesa(identificador, catalogo = PROJETOS) {
  const m = IDENTIFICADOR.exec(String(identificador ?? '').trim());
  if (!m) throw new RecusaMesa('identificador de carta inválido (use SIGLA-N)');
  const doCatalogo = catalogo.find(p => p.sigla === m[1]);
  if (doCatalogo?.plane === ANYA_PLANE_ID) throw new RecusaMesa('Anya fica fora da mesa: a verdade dele é o Linear');
  if (doCatalogo?.plane === CKBL_PLANE_ID) throw new RecusaMesa('CKBL fica fora da mesa: lá o Plane só aceita as identidades Codex/Claude e a ponte REST');
  if (doCatalogo?.congelado) throw new RecusaMesa('projeto congelado: só leitura');
  const projeto = projetosDaMesa(catalogo).find(p => p.sigla === m[1]);
  if (!projeto) throw new RecusaMesa('projeto fora da mesa de decisão');
  return { projeto, sigla: m[1], numero: Number(m[2]), identificador: `${m[1]}-${m[2]}` };
}
