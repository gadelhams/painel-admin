// Propostas de decisão do C-3PO (PAINEL-65): confere a forma de {carta, decisão, motivo, efeitos} pela régua da mesa e devolve um id de proposta. Não lê nem grava o Plane e nunca emite confirmação.
//
// É o único pedaço da escrita da mesa que o motor alcança. A proposta vira um cartão no chat;
// quem prepara (a carta é relida, o delta é calculado) e grava é o dono, pelo cartão, nas
// mesmas /api/decisao/{preparar,confirmar} da gaveta, com a sessão do Cadastro Único. A prova
// de que o dono quis gravar chega ao servidor pelo toque dele, por um canal que o modelo não
// lê nem escreve: mensagem de conversa não serve, porque o front manda turnos sozinho e o
// histórico da conversa é gravável por processo local (revisão de desenho, 06/11/2026).
//
// Na gaveta os efeitos nunca vêm do modelo (o rascunho volta com eles desmarcados). Aqui vêm,
// por decisão do dono (06/11/2026): o C-3PO os propõe e o cartão os mostra em destaque antes
// do toque. A régua é a mesma lista fechada de efeitos.js.
import { randomUUID } from 'node:crypto';
import { cartaDaMesa, RecusaMesa } from './permissao.js';
import { validarProsa } from './protocolo-decisao.js';
import { validarPedido } from './efeitos.js';

const PRAZO_MS = 30 * 60_000;
const TETO = 50;

export { RecusaMesa as RecusaPropostaDecisao };

export function criarRegistroPropostasDecisao({ agora = () => Date.now(), prazoMs = PRAZO_MS, ambiente = process.env, catalogo } = {}) {
  const propostas = new Map();
  const limpar = () => { for (const [id, p] of propostas) if (p.expiraEm <= agora()) propostas.delete(id); };

  function propor({ carta, decisao, motivo, efeitos } = {}) {
    limpar();
    const alvo = catalogo ? cartaDaMesa(carta, catalogo) : cartaDaMesa(carta);
    const prosa = validarProsa({ decisao, motivo }, { ambiente });
    const pedido = validarPedido(efeitos);
    // Cheio, sai a mais antiga: a proposta só precisa viver até o evento do chat sair, e recusar
    // deixaria um processo local (o loopback não tem login) trancar as propostas do dono por 30 min.
    if (propostas.size >= TETO) propostas.delete(propostas.keys().next().value);
    const id = randomUUID();
    const proposta = { id, carta: alvo.identificador, projeto: alvo.projeto.titulo, decisao: prosa.decisao, motivo: prosa.motivo,
      efeitos: pedido, expiraEm: agora() + prazoMs };
    propostas.set(id, proposta);
    return publica(proposta);
  }

  const publica = p => ({ ...p, efeitos: { ...p.efeitos }, expiraEm: new Date(p.expiraEm).toISOString() });

  function obter(id) {
    limpar();
    const p = propostas.get(id);
    return p ? publica(p) : null;
  }

  return { propor, obter };
}

export const propostasDecisao = criarRegistroPropostasDecisao();
