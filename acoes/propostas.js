// Propostas de ação do C-3PO: registra {projeto, comandoId} conferido contra o contrato e devolve um id de proposta. Nunca executa nem emite confirmação.
//
// É o único pedaço das ações que o motor alcança. Executar mora em executor-acoes.js
// e confirmar em api-acoes.js, atrás do SSO do dono; um teste estrutural garante que
// nada que o motor importa chega lá.
import { randomUUID } from 'node:crypto';
import { PROJETOS } from '../projetos.js';
import { RAIZ, contratoDoProjeto, pastaDoContrato } from '../orquestrador/contrato-local.js';
import { comandoPermitido } from '../orquestrador/politica.js';
import { UUID } from '../orquestrador/uuid.js';
import { criarDiarioAcoes } from './diario-acoes.js';

const PRAZO_MS = 30 * 60_000;
const TETO = 50;

export class RecusaProposta extends Error {}

export function criarRegistroPropostas({ projetos = PROJETOS, raiz = RAIZ, lerContrato = contratoDoProjeto,
  diario = criarDiarioAcoes(), agora = () => Date.now(), prazoMs = PRAZO_MS } = {}) {
  const propostas = new Map();
  const limpar = () => { for (const [id, p] of propostas) if (p.expiraEm <= agora()) propostas.delete(id); };

  // Lido de novo no preparo: o contrato pode ter mudado desde a proposta.
  async function resolver({ projeto, comandoId }) {
    const p = projetos.find(x => x.pasta === projeto);
    if (!p) throw new RecusaProposta('projeto fora do catálogo');
    const { contrato, erros } = await lerContrato(p, raiz);
    if (!contrato) throw new RecusaProposta(`${p.pasta} não tem contrato .orquestrador.json: não há comando que eu possa propor`);
    if (erros.length) throw new RecusaProposta(`contrato de ${p.pasta} inválido: ${erros.join('; ')}`);
    let comando;
    try { comando = comandoPermitido(contrato, comandoId); }
    catch { throw new RecusaProposta(`comando fora do contrato de ${p.pasta}; permitidos: ${contrato.comandos.map(c => c.id).join(', ')}`); }
    return { projeto: p.pasta, titulo: p.titulo, pasta: pastaDoContrato(p, raiz), comandoId: comando.id,
      executavel: comando.executavel, argumentos: [...comando.argumentos] };
  }

  async function propor({ projeto, comandoId }) {
    limpar();
    let alvo;
    try { alvo = await resolver({ projeto, comandoId }); }
    catch (erro) {
      await diario.anotar({ etapa: 'proposta-recusada', quem: 'c3po', projeto: String(projeto ?? '').slice(0, 80),
        comandoId: String(comandoId ?? '').slice(0, 40), motivo: erro.message.slice(0, 200) });
      throw erro;
    }
    if (propostas.size >= TETO) throw new RecusaProposta('propostas demais em aberto; espere uma expirar');
    const id = randomUUID();
    const expiraEm = agora() + prazoMs;
    propostas.set(id, { id, projeto: alvo.projeto, comandoId: alvo.comandoId, expiraEm, usada: false });
    await diario.anotar({ etapa: 'proposta', quem: 'c3po', propostaId: id, projeto: alvo.projeto, comandoId: alvo.comandoId,
      executavel: alvo.executavel, argumentos: alvo.argumentos });
    return publica(propostas.get(id), alvo);
  }

  function publica(p, alvo) {
    return { id: p.id, projeto: p.projeto, titulo: alvo.titulo, comandoId: p.comandoId,
      comando: [alvo.executavel, ...alvo.argumentos].join(' '), expiraEm: new Date(p.expiraEm).toISOString() };
  }

  function obter(id) {
    limpar();
    if (!UUID.test(id ?? '')) return null;
    const p = propostas.get(id);
    return p && !p.usada ? { id: p.id, projeto: p.projeto, comandoId: p.comandoId } : null;
  }

  // Uma proposta roda uma vez: repetir é pedir outra ao C-3PO.
  function consumir(id) {
    const p = propostas.get(id);
    if (!p || p.usada || p.expiraEm <= agora()) return false;
    p.usada = true;
    return true;
  }

  return { propor, obter, resolver, consumir };
}

// Instância do processo: o motor propõe nela, a rota de ações lê dela.
export const propostas = criarRegistroPropostas();
