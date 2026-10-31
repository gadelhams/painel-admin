// O lado do painel da reserva de carta: resolve SIGLA-N, confere quem pede pelo /proc e comenta RESERVA/v1 na carta pela identidade técnica do projeto. O lease local é do script (reservas.js).
//
// A rota não tem SSO de propósito (decisão do contrato da F4, item 9): quem reserva é o agente
// local, sem cookie. O que a fecha: Host e endereço de loopback, sem cabeçalho de navegador, e o
// processo dono do socket cliente (achado no /proc, nunca informado por quem pede) descendente
// de uma CLI conhecida (claude, codex) cujo pid é o da reserva viva. Projeto sem identidade
// técnica: só o lease local, com aviso.
import { PROJETOS } from '../projetos.js';
import { ErroAcesso } from './erro-acesso.js';
import { UUID } from './uuid.js';
import { ehLoopback } from './peer-loopback.js';

const CARTA = /^([A-Z][A-Z0-9]*)-(\d{1,6})$/;
const escapar = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class ReservaServico {
  constructor({ consultar, reservas, identidade, pidDoCliente, sessaoAncestral, porta = 7777, log = () => {} }) {
    this.hosts = new Set([`127.0.0.1:${porta}`, `localhost:${porta}`]);
    this.consultar = consultar;
    this.reservas = reservas;
    this.identidade = identidade;
    this.pidDoCliente = pidDoCliente;
    this.sessaoAncestral = sessaoAncestral;
    this.log = log;
  }

  async resolver(carta) {
    const m = CARTA.exec(carta ?? '');
    if (!m) throw new ErroAcesso('carta fora da forma SIGLA-N', 422);
    const projeto = PROJETOS.find(p => p.sigla === m[1] && p.plane);
    if (!projeto) throw new ErroAcesso('sigla fora do catálogo', 422);
    const item = await this.consultar(`/work-items/${m[1]}-${m[2]}/`);
    const projetoId = typeof item?.project === 'string' ? item.project : item?.project?.id;
    if (!UUID.test(item?.id ?? '') || projetoId !== projeto.plane) throw new ErroAcesso('carta não encontrada no projeto da sigla', 404);
    return { carta: `${m[1]}-${m[2]}`, cartaId: item.id, projetoId, estadoGrupo: item.state?.group ?? null };
  }

  // GET aberto: resolve e diz se há reserva viva (sem pid nem pasta de quem reservou).
  async situacao(carta) {
    const alvo = await this.resolver(carta);
    const ocupada = await this.reservas.ocupadaPorOutro(alvo.cartaId);
    return { ...alvo, reservada: Boolean(ocupada), quem: ocupada?.reserva?.quem ?? null, validaAte: ocupada?.reserva?.validaAte ?? null };
  }

  async quemPede(req) {
    const pid = await this.pidDoCliente(req.socket);
    const sessao = pid ? await this.sessaoAncestral(pid) : null;
    if (!sessao) throw new ErroAcesso('processo de origem não é sessão de CLI conhecida', 403);
    return sessao;
  }

  // Antes do corpo: Host de loopback (a borda do tailnet chega com o nome dela), endereço de
  // loopback e nenhum cabeçalho que só navegador manda (Origin, Sec-Fetch-Site, cookie).
  recusar(req) {
    if (!this.hosts.has(String(req.headers?.host ?? '').toLowerCase()) || !ehLoopback(req.socket?.remoteAddress) ||
        req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined || req.headers.cookie !== undefined) {
      return new ErroAcesso('reserva só pelo script local, no loopback', 403);
    }
    if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return new ErroAcesso('tipo de conteúdo recusado', 415);
    return null;
  }

  // A rota inteira: { status, corpo }. Falha do Plane não ecoa detalhe.
  async api(req, url, lerCorpo) {
    try {
      if (req.method !== 'POST') return { status: 200, corpo: await this.situacao(url.searchParams.get('carta')) };
      const recusa = this.recusar(req);
      if (recusa) throw recusa;
      const sessao = await this.quemPede(req);
      let corpo;
      try { corpo = JSON.parse(await lerCorpo(req)); } catch { throw new ErroAcesso('corpo JSON inválido', 400); }
      return { status: 200, corpo: await this.comentar(sessao, corpo) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      this.log(`[reservas] falha: ${erro.message}`);
      return { status: 502, corpo: { erro: 'reserva no Plane falhou; o lease local continua valendo' } };
    }
  }

  // corpo: { carta, acao: 'reservar'|'soltar', reserva: <id do lease> }.
  async comentar(sessao, corpo) {
    if (!corpo || typeof corpo !== 'object' || Object.keys(corpo).sort().join(',') !== 'acao,carta,reserva' ||
        !['reservar', 'soltar'].includes(corpo.acao) || !UUID.test(corpo.reserva ?? '')) throw new ErroAcesso('campos da reserva inválidos', 422);
    const alvo = await this.resolver(corpo.carta);
    const atual = await this.reservas.ler(alvo.cartaId).catch(() => null);
    if (corpo.acao === 'reservar' && (!atual || atual.id !== corpo.reserva || atual.pid !== sessao.pid || !(await this.reservas.viva(atual)))) {
      throw new ErroAcesso('reserva local ausente ou de outra sessão; rode o script de reserva', 409);
    }
    if (corpo.acao === 'soltar' && atual && await this.reservas.viva(atual)) throw new ErroAcesso('carta ainda reservada; nada a liberar', 409);
    const escrita = this.identidade(alvo.projetoId);
    if (!escrita?.escritorReserva) return { ...alvo, comentado: false, aviso: 'projeto sem identidade técnica de escrita: só o lease local' };
    const html = corpo.acao === 'reservar'
      ? `<p>RESERVA/v1 ${escapar(sessao.quem)}</p><p>Carta reservada por uma sessão ${escapar(sessao.quem)} até ${escapar(atual.validaAte)}. Vigília, despacho, zelador e mesa não a tocam enquanto a reserva estiver viva.</p>`
      : `<p>RESERVA/v1 ${escapar(sessao.quem)} liberada</p><p>A sessão soltou a reserva; a carta volta a estar livre.</p>`;
    const comentarioId = await escrita.escritorReserva({ projetoId: alvo.projetoId, cartaId: alvo.cartaId, html,
      externalId: `${corpo.acao === 'reservar' ? 'reserva' : 'solta'}-${corpo.reserva}` });
    let estado = null;
    // In Progress só a partir de Backlog/Todo; carta já andando ou fechada fica como está.
    if (corpo.acao === 'reservar' && ['backlog', 'unstarted'].includes(alvo.estadoGrupo) && escrita.escritorEstado) {
      try {
        const carta = await this.consultar(`/projects/${alvo.projetoId}/work-items/${alvo.cartaId}/`);
        estado = (await escrita.escritorEstado({ projetoId: alvo.projetoId, cartaId: alvo.cartaId, grupo: 'started', versaoCarta: carta.updated_at })).estadoNome;
      } catch (erro) { this.log(`[reservas] ${alvo.carta}: estado não mudou: ${erro.message}`); estado = 'não mudou'; }
    }
    return { ...alvo, comentado: true, comentarioId, estado };
  }
}

// A mesa de decisão (decisao/) recusa carta reservada por outra sessão sem mudar nada lá dentro:
// a montagem embrulha o `preparar` das duas ações. A conferência vem DEPOIS do preparar da mesa
// (que já recusou o que é dela sem tocar no Plane); a carta reservada devolve 409 e o desafio
// guardado morre sem que o id dele saia. Fica a janela de até 2 min entre preparar e confirmar
// (a reserva nascida nesse intervalo não é vista): o confirmar só tem o id do desafio.
export function recusarReservadaNaMesa(confirmacoes, servico) {
  return {
    ...confirmacoes,
    async preparar(entrada, identidade) {
      const preparado = await confirmacoes.preparar(entrada, identidade);
      // A mesa acabou de ler a carta pelo cliente dela; se a resolução pela chave Guest falhar
      // aqui, a decisão do dono (SSO) segue: a reserva é coordenação entre agentes, não trava dele.
      let cartaId = null;
      try { cartaId = (await servico.resolver(String(entrada.carta).trim())).cartaId; }
      catch (erro) { servico.log(`[reservas] mesa: reserva de ${entrada.carta} não conferida: ${erro.message}`); }
      const ocupada = cartaId ? await servico.reservas.ocupadaPorOutro(cartaId) : null;
      if (ocupada) throw new ErroAcesso(`carta reservada por outra sessão: ${ocupada.motivo}; nada foi gravado`, 409);
      return preparado;
    },
  };
}
