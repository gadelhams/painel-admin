// Liga e desliga a vigília de um projeto e monta o estado dela. Não escolhe carta nem despacha; a pausa da frota mora em frota-pausas.js.
//
// O `pausadaAte` por projeto saiu (correção J-L6, 29/10/2026): o único escritor era a
// pausa por limite de uso, que virou pausa global por provedor; um leitor sem escritor
// só deixaria uma pausa fantasma.

import { avisosDoContrato, configuracaoVigilia } from './politica.js';
import { incompatibilidadesFrota } from './modelos.js';

import { UUID } from './uuid.js';

function recusa(mensagem) { const e = new Error(mensagem); e.semEscrita = true; return e; }

export class VigiliaControle {
  constructor({ servico, projetos, agora, intervaloMs, livro, memoria, ocupada }) {
    this.servico = servico;
    this.projetos = projetos;
    this.agora = agora;
    this.intervaloMs = intervaloMs;
    this.livro = livro;
    this.memoria = memoria;
    this.ocupada = ocupada;
  }

  projeto(id) {
    const p = this.projetos.find(x => x.plane === id);
    if (!p) throw recusa('projeto fora do catálogo');
    return p;
  }

  async situacao(p) {
    const id = p.plane;
    const [{ contrato, erros }, local, feitas, frota] = await Promise.all([
      this.servico.contrato(id), this.livro.ler(id), this.livro.tentativas24h(id), this.servico.lerFrota(),
    ]);
    const cfg = configuracaoVigilia(contrato);
    const impedimentos = [];
    if (!contrato) impedimentos.push('contrato local ausente');
    else if (erros.length) impedimentos.push(...erros.map(x => `contrato: ${x}`));
    else if (!cfg) impedimentos.push('contrato sem bloco vigilia');
    if (!this.servico.podeDespachar(id)) impedimentos.push('executor desligado ou identidade de escrita ausente');
    if (frota.estado !== 'ok') impedimentos.push(`frota ${frota.estado}: configure a frota antes de ligar`);
    else if (contrato && !erros.length) impedimentos.push(...incompatibilidadesFrota(contrato, frota.conteudo.executor));
    const lembranca = this.memoria.get(id) ?? {};
    return { projetoId: id, pasta: p.pasta, nome: p.titulo ?? p.nome ?? p.pasta, temContrato: Boolean(contrato),
      ligada: Boolean(local.ligada), ligadaPor: local.ligadaPor ?? null, desde: local.desde ?? null,
      tentativasHoje: feitas, limites: cfg ? { maxTentativasPorCarta: cfg.maxTentativasPorCarta, tetoPorDia: cfg.tetoPorDia,
        pausaPorLimiteMinutos: cfg.pausaPorLimiteMinutos, comando: cfg.comando } : null,
      frota: { estado: frota.estado, versao: frota.versao ?? null, hash: frota.hash ?? null }, avisos: contrato && !erros.length ? avisosDoContrato(contrato) : [], impedimentos,
      ultimaVarredura: lembranca.ultimaVarredura ?? null, proximaCarta: lembranca.proximaCarta ?? null,
      motivoOciosa: lembranca.motivoOciosa ?? null, diario: (await this.livro.linhas(id)).slice(-20).reverse() };
  }

  async estado() {
    const lista = [];
    for (const p of this.projetos.filter(x => x.plane)) {
      const s = await this.situacao(p);
      if (s.temContrato) lista.push(s);
    }
    return { atualizadoEm: this.livro.iso(), intervaloSegundos: Math.round(this.intervaloMs / 1000), varrendo: this.ocupada.atual, projetos: lista,
      pausasFrota: await this.servico.pausasFrota.ler(),
      observacao: 'A vigília despacha sozinha as cartas elegíveis do projeto ligado, uma por vez, com os modelos da frota e os mesmos portões do despacho manual; ligar exige sessão e confirmação. Nunca faz push nem merge.' };
  }

  async validar(projetoId, ligar) {
    if (!UUID.test(projetoId ?? '') || typeof ligar !== 'boolean') throw recusa('projeto ou ação inválidos');
    const s = await this.situacao(this.projeto(projetoId));
    if (ligar && s.impedimentos.length) throw recusa(`vigília não pode ser ligada: ${s.impedimentos.join('; ')}`);
    return { projetoId, nome: s.nome, ligar, jaEstava: s.ligada === ligar, limites: s.limites, frota: s.frota,
      aviso: ligar ? 'Confirmar liga a varredura automática: cartas elegíveis deste projeto serão despachadas sem nova confirmação, dentro dos freios do contrato.'
        : 'Confirmar desliga a varredura; uma tentativa já em curso termina e grava o resultado.' };
  }

  async alternar(projetoId, ligar, usuarioId) {
    const dados = await this.validar(projetoId, ligar);
    const anterior = await this.livro.ler(projetoId);
    await this.livro.gravar(projetoId, { ligada: ligar, ligadaPor: ligar ? String(usuarioId) : anterior.ligadaPor ?? null,
      desde: this.livro.iso() });
    await this.livro.anotar(projetoId, { tipo: ligar ? 'LIGADA' : 'DESLIGADA', usuarioId: String(usuarioId) });
    return { ...dados, ligada: ligar };
  }
}
