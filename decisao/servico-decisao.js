// O que a mesa de decisão oferece às rotas: a carta para a gaveta, o preparar (prosa, efeitos e digital, sem escrita), as aplicações pendentes e o preparo da retomada (delta recalculado) e do abandono. A escrita mora em aplicacao-decisao.js.
//
// Sem `PLANE_ADMIN_ACTOR_ID` (ou sem a chave Guest) não há escritor: a gaveta abre só para
// leitura e diz por quê; preparar e retomar recusam com 503.
import { cartaParaLeitura } from './leitor-carta.js';
import { textoDeHtml } from './texto-html.js';
import { RecusaMesa } from './permissao.js';
import { codificarDecisao, validarProsa, FONTE } from './protocolo-decisao.js';
import { calcularDelta, digital, esperaDecisao, validarPedido } from './efeitos.js';
import { planoRetomada, recusaRetomada } from './retomada-decisao.js';

const AVISO = 'Confirmar grava no Plane, com a identidade Painel Admin: primeiro o comentário DECISAO/v1 acima, depois só as mudanças listadas; a carta é relida e, se mudou, nada é gravado.';
const publico = p => ({ chave: p.chave, identificador: p.identificador, quando: p.quando, decisao: p.decisao, etapa: p.etapa });

// `ambiente`: o do processo, para o filtro de segredo comparar valores (nunca ecoa).
export function criarServicoDecisao({ leitor, escritor = null, motivoSemEscrita = null, diario, aplicacao, agora = Date.now, ambiente = process.env }) {
  const escrita = () => (escritor ? { habilitada: true, motivo: null } : { habilitada: false, motivo: motivoSemEscrita });
  const exigirEscrita = () => { if (!escritor) throw new RecusaMesa(motivoSemEscrita ?? 'escrita da mesa desligada', 503); };

  async function carta(identificador) {
    const r = await leitor.retrato(identificador);
    const pendentes = (await diario.pendentes()).filter(p => p.cartaId === r.cartaId).map(publico);
    return { ...cartaParaLeitura(r, { autorMesa: escritor?.autor ?? null }), esperaDecisao: esperaDecisao(r.carta), escrita: escrita(), pendentes };
  }

  async function preparar({ carta: identificador, decisao, motivo, efeitos }) {
    exigirEscrita();
    const prosa = validarProsa({ decisao, motivo }, { ambiente });
    const pedido = validarPedido(efeitos);
    try { await escritor.conferirIdentidade(); } catch (e) { throw new RecusaMesa(e.message, 503); }
    const r = await leitor.retrato(identificador);
    if (!esperaDecisao(r.carta)) throw new RecusaMesa('a carta não espera decisão do dono (sem ASTARGNE, DONO nem PRODUTO)');
    if (await aplicacao.leaseAtivo(r.cartaId)) throw new RecusaMesa('a carta tem execução da orquestração em curso (lease ativo)', 409);
    if ((await diario.pendentes()).some(p => p.cartaId === r.cartaId)) throw new RecusaMesa('há aplicação pendente desta carta: retome-a antes', 409);
    const quando = agora();
    const delta = calcularDelta(r, pedido, { decisao: prosa.decisao, quando });
    const html = codificarDecisao({ identificador: r.alvo.identificador, decisao: prosa.decisao, motivo: prosa.motivo, efeitos: delta.linhas, quando });
    return {
      guardar: { identificador: r.alvo.identificador, sigla: r.alvo.sigla, numero: r.alvo.numero, projetoId: r.alvo.projeto.projetoId,
        pasta: r.alvo.projeto.pasta, cartaId: r.cartaId, decisao: prosa.decisao, motivo: prosa.motivo, pedido, delta, html,
        digital: digital(r), quando },
      resposta: { carta: r.alvo.identificador, titulo: String(r.carta.name ?? ''), comentario: textoDeHtml(html),
        mudancas: delta.linhas, avisos: delta.avisos, aviso: AVISO },
    };
  }

  const pendente = async chave => {
    const p = (await diario.pendentes()).find(x => x.chave === chave);
    if (!p) throw new RecusaMesa('aplicação pendente não encontrada', 404);
    return p;
  };

  // A tela mostra o delta RECALCULADO contra a carta de agora, nunca o do diário.
  async function prepararRetomada({ chave }) {
    exigirEscrita();
    const p = await pendente(chave);
    const reg = p.registro;
    const r = await leitor.reler({ identificador: reg.identificador, sigla: reg.sigla, numero: reg.numero,
      projeto: { projetoId: reg.projetoId, pasta: reg.pasta } }, reg.cartaId);
    const plano = planoRetomada(reg, r, { agora: agora(), leaseAtivo: await aplicacao.leaseAtivo(reg.cartaId) });
    const naCarta = p.etapa === 'comentario-gravado' || r.comentarios.some(c => c.external_source === FONTE && c.external_id === chave &&
      (c.actor?.id ?? c.actor ?? c.created_by?.id ?? c.created_by) === escritor.autor);
    if (!plano.ok && naCarta) throw recusaRetomada(plano.motivo);
    return { guardar: { chave },
      resposta: { ...publico(p), aviso: naCarta
        ? 'O comentário DECISAO/v1 já está na carta. Confirmar relê a carta, aplica as mudanças abaixo (recalculadas agora), verifica e grava o recibo.'
        : plano.ok ? 'O comentário DECISAO/v1 não está na carta. Confirmar o grava de novo (a mesma chave) e segue com as mudanças abaixo.'
          : `O comentário DECISAO/v1 não chegou e ${plano.motivo}: confirmar fecha a pendência como abandonada, sem gravar nada.`,
      mudancas: plano.ok ? plano.mudancas : [] } };
  }

  async function prepararAbandono({ chave }) {
    const p = await pendente(chave);
    return { guardar: { chave },
      resposta: { ...publico(p), mudancas: [],
        aviso: 'Abandonar fecha esta pendência sem aplicar mais nada: grava DECISAO_ABANDONADA no diário e, se a carta estiver acessível, um recibo "abandonada" nela. O comentário DECISAO/v1 que já estiver na carta fica lá.' } };
  }

  return { escrita, carta, preparar, prepararRetomada, prepararAbandono, pendentes: async () => (await diario.pendentes()).map(publico) };
}
