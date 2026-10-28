// Duas ações: preparar guarda o desafio; confirmar grava. A sessão que preparou é a que confirma.

import { randomUUID, timingSafeEqual } from 'node:crypto';
import { ErroAcesso } from '../orquestrador/sso.js';
import { pendentes } from '../orquestrador/confirmacoes.js';

export function criarConfirmacoesChaves({ servico, agora = () => Date.now() }) {
  const desafios = new Map();
  const limpar = () => { for (const [id, d] of desafios) if ((d.estado === 'pendente' ? d.expiraEm : d.reterAte) <= agora()) desafios.delete(id); };
  return {
    async preparar({ projeto, nome, alvo }, identidade) {
      limpar();
      if (pendentes(desafios) >= 100) throw new ErroAcesso('muitas confirmações pendentes', 429);
      if (!['local', 'servidor', 'fora'].includes(alvo) || typeof projeto !== 'string' || typeof nome !== 'string') throw new ErroAcesso('projeto, nome ou alvo inválidos', 422);
      const dados = await servico.preparar({ projeto, nome, alvo });
      const id = randomUUID();
      const expiraEm = agora() + 120_000;
      desafios.set(id, { estado: 'pendente', expiraEm, identidade, projeto, nome, alvo });
      return { confirmacaoId: id, expiraEm: new Date(expiraEm).toISOString(), ...dados };
    },
    async confirmar(id, valor, identidade) {
      const d = desafios.get(id);
      if (!d) throw new ErroAcesso('confirmação ausente ou expirada', 404);
      const a = Buffer.from(identidade.sessaoHash ?? '', 'hex');
      const b = Buffer.from(d.identidade.sessaoHash ?? '', 'hex');
      if (identidade.usuarioId !== d.identidade.usuarioId || a.length !== 32 || b.length !== 32 || !timingSafeEqual(a, b)) throw new ErroAcesso('confirmação pertence a outra sessão', 403);
      if (d.estado === 'concluida') return d.resultado;
      if (d.estado !== 'pendente') throw new ErroAcesso('confirmação já usada ou resultado incerto', 409);
      if (d.expiraEm <= agora()) { desafios.delete(id); throw new ErroAcesso('confirmação expirada', 410); }
      d.estado = 'executando';
      try {
        d.resultado = await servico.confirmar({ projeto: d.projeto, nome: d.nome, alvo: d.alvo }, valor, identidade.usuarioId);
        d.estado = 'concluida'; d.reterAte = agora() + 3_600_000;
        return d.resultado;
      } catch (erro) {
        if (erro instanceof ErroAcesso) { desafios.delete(id); throw erro; }
        d.estado = 'incerta'; d.reterAte = agora() + 3_600_000;
        throw erro;
      }
    },
  };
}
