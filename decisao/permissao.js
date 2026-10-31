// Quais projetos a mesa de decisão abre: os do catálogo com Plane e sigla, menos os congelados e menos o Anya (recusado pelo id do projeto, não pela sigla). Não lê o Plane.
//
// A lista deriva de projetos.js (a mesma fonte do Hangar): projeto novo no catálogo entra
// sozinho. O Anya fica fora porque lá o Plane é espelho do Linear — o que a mesa gravasse
// seria sobrescrito (PADROES-BACKLOG.md); a recusa é por id para sobreviver a troca de sigla.
import { PROJETOS } from '../projetos.js';
import { ErroAcesso } from '../orquestrador/sso.js';

export const ANYA_PLANE_ID = '56104829-419b-4ad7-be84-2858f22c5617';
const IDENTIFICADOR = /^([A-Z][A-Z0-9]{0,9})-([1-9]\d{0,6})$/;

// Recusa nomeada da mesa: a fronteira das duas ações devolve a mensagem (que é nossa, nunca
// dado do Plane) com o status, em vez da falha genérica.
export class RecusaMesa extends ErroAcesso {
  constructor(mensagem, status = 422) { super(mensagem, status); }
}

export function projetosDaMesa(catalogo = PROJETOS) {
  return catalogo.filter(p => p.plane && p.sigla && !p.congelado && p.plane !== ANYA_PLANE_ID)
    .map(p => ({ pasta: p.pasta, titulo: p.titulo, sigla: p.sigla, projetoId: p.plane }));
}

// SIGLA-N → { projeto, sigla, numero }. O projeto vem do catálogo, nunca do pedido.
export function cartaDaMesa(identificador, catalogo = PROJETOS) {
  const m = IDENTIFICADOR.exec(String(identificador ?? '').trim());
  if (!m) throw new RecusaMesa('identificador de carta inválido (use SIGLA-N)');
  const doCatalogo = catalogo.find(p => p.sigla === m[1]);
  if (doCatalogo?.plane === ANYA_PLANE_ID) throw new RecusaMesa('Anya fica fora da mesa: a verdade dele é o Linear');
  if (doCatalogo?.congelado) throw new RecusaMesa('projeto congelado: só leitura');
  const projeto = projetosDaMesa(catalogo).find(p => p.sigla === m[1]);
  if (!projeto) throw new RecusaMesa('projeto fora da mesa de decisão');
  return { projeto, sigla: m[1], numero: Number(m[2]), identificador: `${m[1]}-${m[2]}` };
}
