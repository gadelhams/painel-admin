// O que a mesa de decisão oferece às rotas: a carta para a gaveta, o preparar (prosa, efeitos e digital, sem escrita), as aplicações pendentes e o preparo da retomada. A escrita mora em aplicacao-decisao.js.
//
// Sem `PLANE_ADMIN_ACTOR_ID` (ou sem a chave Guest) não há escritor: a gaveta abre só para
// leitura e diz por quê; preparar e retomar recusam com 503.
import { cartaParaLeitura } from './leitor-carta.js';
import { textoDeHtml } from './texto-html.js';
import { RecusaMesa } from './permissao.js';
import { codificarDecisao, validarProsa } from './protocolo-decisao.js';
import { calcularDelta, digital, esperaDecisao, validarPedido } from './efeitos.js';

const AVISO = 'Confirmar grava no Plane, com a identidade Painel Admin: primeiro o comentário DECISAO/v1 acima, depois só as mudanças listadas; a carta é relida e, se mudou, nada é gravado.';
const publico = p => ({ chave: p.chave, identificador: p.identificador, quando: p.quando, decisao: p.decisao, etapa: p.etapa });

export function criarServicoDecisao({ leitor, escritor = null, motivoSemEscrita = null, diario, aplicacao, agora = Date.now }) {
  const escrita = () => (escritor ? { habilitada: true, motivo: null } : { habilitada: false, motivo: motivoSemEscrita });
  const exigirEscrita = () => { if (!escritor) throw new RecusaMesa(motivoSemEscrita ?? 'escrita da mesa desligada', 503); };

  async function carta(identificador) {
    const r = await leitor.retrato(identificador);
    const pendentes = (await diario.pendentes()).filter(p => p.cartaId === r.cartaId).map(publico);
    return { ...cartaParaLeitura(r, { autorMesa: escritor?.autor ?? null }), esperaDecisao: esperaDecisao(r.carta), escrita: escrita(), pendentes };
  }

  async function preparar({ carta: identificador, decisao, motivo, efeitos }) {
    exigirEscrita();
    const prosa = validarProsa({ decisao, motivo });
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

  async function prepararRetomada({ chave }) {
    exigirEscrita();
    const p = (await diario.pendentes()).find(x => x.chave === chave);
    if (!p) throw new RecusaMesa('aplicação pendente não encontrada', 404);
    return { guardar: { chave },
      resposta: { ...publico(p), aviso: p.etapa === 'comentario-gravado'
        ? 'O comentário DECISAO/v1 já está na carta. Confirmar relê a carta, aplica as mudanças que faltam, verifica e grava o recibo.'
        : 'O comentário DECISAO/v1 pode não ter chegado. Confirmar procura por ele na carta; se não está e a carta mudou, a decisão é abandonada sem gravar nada.',
      mudancas: p.registro.delta?.linhas ?? [] } };
  }

  return { escrita, carta, preparar, prepararRetomada, pendentes: async () => (await diario.pendentes()).map(publico) };
}
