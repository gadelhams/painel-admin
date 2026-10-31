// Duas ações da memória L1: preparar mostra o diff contra a versão-base; confirmar, com a mesma sessão SSO do dono, grava uma vez. Também monta a leitura da tela. Não registra proposta.
//
// Um caminho só para os três jeitos de mudar: `origem` texto (o dono editou), proposta (o
// C-3PO propôs no chat), reflexao (a pendente da noite) e versao (desfazer: voltar a um
// texto que o histórico conhece, pelo hash).
import { ErroAcesso } from '../orquestrador/sso.js';
import { criarDesafios } from '../orquestrador/desafio-duas-acoes.js';
import { criarApiDuasAcoes } from '../orquestrador/api-duas-acoes.js';
import { filtrarSegredo } from '../acoes/filtro-segredo.js';
import { TETO_BYTES, bytesDe, hashTexto } from './arquivo-memoria.js';
import { validarTextoMemoria } from './escritor-memoria.js';
import { diffMemoria } from './diff.js';

const ORIGENS = ['texto', 'proposta', 'reflexao', 'versao'];
const recusaLimpa = erro => (erro.semEscrita ? new ErroAcesso(`recusado; nada foi gravado: ${erro.message}`, erro.status ?? 422) : null);

export function criarConfirmacoesMemoria({ leitor, escritor, propostas, pendente, ambiente = process.env, agora }) {
  async function alvo(origem, valor) {
    if (!ORIGENS.includes(origem) || typeof valor !== 'string') throw new ErroAcesso('origem da mudança inválida', 422);
    if (origem === 'texto') return { texto: valor, quem: 'dono', origem: 'dono' };
    if (origem === 'versao') {
      const texto = await leitor.versao(valor);
      if (texto === null) throw new ErroAcesso('versão desconhecida no histórico da memória', 404);
      return { texto, quem: 'dono', origem: 'desfazer' };
    }
    if (origem === 'proposta') {
      const p = propostas.obter(valor);
      if (!p) throw new ErroAcesso('proposta de memória ausente, expirada ou já usada; peça outra ao C-3PO', 404);
      return { texto: p.texto, quem: 'proposta-aceita', origem: 'c3po', base: p.base, motivo: p.motivo, propostaId: p.id };
    }
    const p = await pendente.ler();
    if (!p || p.ilegivel || p.id !== valor) throw new ErroAcesso('proposta da reflexão ausente ou já resolvida', 404);
    return { texto: p.texto, quem: 'proposta-aceita', origem: 'reflexao', base: p.base, motivo: p.motivo, pendenteId: p.id };
  }

  return criarDesafios({
    agora,
    recusaLimpa,
    async validar({ base, origem, valor }) {
      const a = await alvo(origem, valor);
      try { validarTextoMemoria(a.texto); } catch (e) { throw new ErroAcesso(e.message, 422); }
      // A memória entra em toda conversa do modelo: segredo nela vazaria para lá.
      if (filtrarSegredo(a.texto, ambiente) !== a.texto) throw new ErroAcesso('o texto parece conter segredo (chave, token ou senha); a memória não guarda isso', 422);
      const atual = await leitor.ler();
      if (atual.estado === 'ilegivel') throw new ErroAcesso(`${atual.motivo}; conserte o arquivo à mão`, 409);
      if (base !== atual.hash) throw new ErroAcesso('a memória mudou desde que você a abriu; recarregue', 409);
      if (a.base && a.base !== atual.hash) throw new ErroAcesso('a memória mudou desde a proposta; peça outra', 409);
      if (a.texto === atual.texto) throw new ErroAcesso('nada muda: o texto é igual ao atual', 422);
      const diff = diffMemoria(atual.texto, a.texto);
      return {
        guardar: { texto: a.texto, base: atual.hash, quem: a.quem, origem: a.origem, motivo: a.motivo ?? null,
          propostaId: a.propostaId ?? null, pendenteId: a.pendenteId ?? null },
        resposta: { quem: a.quem, origem: a.origem, hashBase: atual.hash, hashNovo: hashTexto(a.texto), bytes: bytesDe(a.texto), teto: TETO_BYTES,
          diff: diff.texto, linhasRemovidas: diff.linhasRemovidas, linhasAcrescentadas: diff.linhasAcrescentadas,
          aviso: 'Confirmar grava esta versão da memória do C-3PO; a anterior fica no histórico para desfazer.' },
      };
    },
    async executar(g, identidade) {
      // Proposta do chat é de uso único: tomada antes de gravar, como a das ações.
      if (g.propostaId && !propostas.consumir(g.propostaId)) throw Object.assign(new Error('proposta expirada ou já usada'), { semEscrita: true, status: 410 });
      const r = await escritor.gravar({ texto: g.texto, base: g.base, quem: g.quem, origem: g.origem, usuarioId: identidade.usuarioId, motivo: g.motivo });
      if (g.pendenteId) await pendente.descartar(g.pendenteId).catch(() => {});
      return r;
    },
  });
}

export function criarApiMemoria({ autorizar, confirmacoes }) {
  return criarApiDuasAcoes({ autorizar, confirmacoes, base: '/api/c3po/memoria',
    camposPreparar: ['base', 'origem', 'valor'],
    falhaPreparar: { mensagem: 'mudança da memória recusada; recarregue e tente de novo' },
    falhaConfirmar: { mensagem: 'gravação incerta; confira o histórico da memória antes de repetir' } });
}

// O que a tela mostra: texto, versão, últimas entradas do histórico e a pendente da reflexão.
export async function estadoMemoria({ leitor, pendente }) {
  const atual = await leitor.ler();
  let historico = [];
  let erroHistorico = null;
  try { historico = await leitor.ultimas(10); } catch (e) { erroHistorico = e.message; }
  const p = await pendente.ler();
  return { ...atual, historico, erroHistorico,
    pendente: p && !p.ilegivel ? { id: p.id, quando: p.quando, motivo: p.motivo, diff: p.diff, base: p.base, fracaoApagada: p.fracaoApagada } : null,
    aviso: 'Memória L1 do C-3PO: entra em toda conversa como dado, não como ordem. Editar pede a sessão do dono.' };
}
