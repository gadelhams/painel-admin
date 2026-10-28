// Liga leitura, despacho, gate, handoff e perfil. A porta pública continua o objeto de funções.

import os from 'node:os';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { criarClientePlane } from '../plane.js';
import { criarEstadoOrquestracao } from './estado.js';
import { RAIZ, contratoDoProjeto } from './contrato-local.js';
import { FilaLeitura } from './fila-leitura.js';
import { DespachoServico } from './despacho-servico.js';
import { SimulacaoDespacho } from './simulacao-despacho.js';
import { GateServico } from './gate-servico.js';
import { HandoffServico } from './handoff-servico.js';
import { PerfilServico } from './perfil-servico.js';
import { CanalCarta } from './canal-carta.js';
import { EstadoCarta } from './estado-carta.js';

export class ServicoOrquestracao {
  constructor({ consultar, raiz = RAIZ, estado = criarEstadoOrquestracao({ diretorio: path.join(os.homedir(), '.local', 'state', 'painel-admin', 'orquestracao') }),
    escritorPerfil = null, escritorHandoff = null, escritorGate = null, projetoEscrita = null, autorEscrita = null,
    identidadesEscrita = {}, executor = null, execucaoHabilitada = false, agora = Date.now } = {}) {
    this.consultar = consultar;
    this.raiz = raiz;
    this.estado = estado;
    this.executor = executor;
    this.execucaoHabilitada = execucaoHabilitada;
    this.agora = agora;
    this.identidades = new Map(Object.entries(identidadesEscrita));
    if (projetoEscrita && autorEscrita) {
      if (this.identidades.has(projetoEscrita)) throw new Error('identidade de escrita duplicada para o projeto');
      this.identidades.set(projetoEscrita, { escritorPerfil, escritorHandoff, escritorGate, autorEscrita });
    }
    this.leitura = new FilaLeitura(this);
    this.despacho = new DespachoServico(this);
    this.simulacao = new SimulacaoDespacho(this);
    this.gates = new GateServico(this);
    this.handoffs = new HandoffServico(this);
    this.perfis = new PerfilServico(this);
    this.canais = new CanalCarta(this);
    this.estadosCarta = new EstadoCarta(this);
  }

  identidade(projetoId) {
    return this.identidades.get(projetoId) ?? null;
  }

  podeDespachar(projetoId) {
    const escrita = this.identidade(projetoId);
    return Boolean(this.execucaoHabilitada && this.executor && escrita?.escritorHandoff && escrita?.escritorPerfil && escrita?.autorEscrita);
  }

  cliente() {
    if (this.consultar) return this.consultar;
    const chave = process.env.PLANE_API_KEY?.trim();
    if (!chave) throw new Error('PLANE_API_KEY de leitura ausente');
    return criarClientePlane({ chave });
  }

  fila(opcoes) { return this.leitura.listar(opcoes); }
  simular(cartaId, comandoId, selecoes) { return this.simulacao.simular(cartaId, comandoId, selecoes); }
  preavaliar(cartaId, gate) { return this.gates.preavaliar(cartaId, gate); }
  canal(cartaId, projetoId) { return this.canais.ler(cartaId, projetoId); }
  modelos(cartaId) { return this.perfis.modelos(cartaId); }
  validarModelos(cartaId, selecoes) { return this.perfis.validar(cartaId, selecoes); }
  registrarModelos(cartaId, selecoes, versaoCarta, chaveIdempotencia) { return this.perfis.registrar(cartaId, selecoes, versaoCarta, chaveIdempotencia); }
  validarHandoff(cartaId, entrada) { return this.handoffs.validar(cartaId, entrada); }
  registrarHandoff(cartaId, entrada, versaoCarta, chaveIdempotencia) { return this.handoffs.registrar(cartaId, entrada, versaoCarta, chaveIdempotencia); }
  validarGate(cartaId, proposta, substituir) { return this.gates.validar(cartaId, proposta, substituir); }
  registrarGate(cartaId, proposta, versaoCarta, chaveIdempotencia, substituir) { return this.gates.registrar(cartaId, proposta, versaoCarta, chaveIdempotencia, substituir); }
  validarDespacho(cartaId, comandoId, versaoCarta, ignorarLeaseId) { return this.despacho.validar(cartaId, comandoId, versaoCarta, ignorarLeaseId); }
  iniciarDespacho(pedido) { return this.despacho.iniciar(pedido); }
  mudarEstado(cartaId, projetoId, grupo, versaoCarta, removerEtiqueta) { return this.estadosCarta.mudar(cartaId, projetoId, grupo, versaoCarta, removerEtiqueta); }
  contrato(projetoId) { return contratoDoProjeto(PROJETOS.find(p => p.plane === projetoId), this.raiz); }
  lerPerfil(projetoId, cartaId) { return this.perfis.ler(projetoId, cartaId); }
}

export function criarServicoOrquestracao(opcoes) {
  const s = new ServicoOrquestracao(opcoes);
  return {
    fila: (o) => s.fila(o),
    simular: (a, b, c) => s.simular(a, b, c),
    preavaliar: (a, b) => s.preavaliar(a, b),
    canal: (a, b) => s.canal(a, b),
    modelos: (a) => s.modelos(a),
    validarModelos: (a, b) => s.validarModelos(a, b),
    registrarModelos: (a, b, c, d) => s.registrarModelos(a, b, c, d),
    validarHandoff: (a, b) => s.validarHandoff(a, b),
    registrarHandoff: (a, b, c, d) => s.registrarHandoff(a, b, c, d),
    validarGate: (a, b, c) => s.validarGate(a, b, c),
    registrarGate: (a, b, c, d, e) => s.registrarGate(a, b, c, d, e),
    validarDespacho: (a, b, c, d) => s.validarDespacho(a, b, c, d),
    iniciarDespacho: (pedido) => s.iniciarDespacho(pedido),
    mudarEstado: (a, b, c, d, e) => s.mudarEstado(a, b, c, d, e),
    contrato: (id) => s.contrato(id),
    podeDespachar: (id) => s.podeDespachar(id),
    lerHistorico: (id) => s.estado.lerHistorico(id),
    recuperarInterrupcoes: () => s.estado.recuperarInterrupcoes(),
  };
}
