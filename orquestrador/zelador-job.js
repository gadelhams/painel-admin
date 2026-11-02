// Um job do zelador num projeto: reconcilia o PENDENTE dele, monta o retrato, roda a CLI fora da trava, valida e aplica veredito por veredito, e fecha com o "nada fazível". O lease e a vez moram no agendador.
//
// O play é relido antes da sequência de cada carta, nunca no meio dela (J66), junto com a
// ocupação do projeto por sessão de IA (B9). Play desligado no início sai PLAY_DESLIGADO (B23);
// com PENDENTE de projeto sem play, o job só fecha recibos (B13); se a reconciliação deixou o
// play desligado ou suspenso, o job para antes do retrato e da CLI (B26). A CLI nunca roda sob
// a trava global (J32). Toda escrita no Plane passa por `sobFencing`: a trava curta, o lease
// conferido como deste job e não vencido, e nenhuma renovação falha desde o começo (J53).
import { lerSaidaCli, validarVeredito } from './zelador-veredito.js';
import { promptZelador } from './zelador-cli.js';
import { nadaFazivel } from './zelador-fim.js';
import { AplicacaoZelador } from './zelador-aplicacao.js';
import { GateZelador } from './zelador-gate.js';
import { todas } from './contrato-local.js';
import { UUID } from './uuid.js';

// W3 (PAINEL-62): o ator do Painel Admin, cuja decisão da mesa destrava a J58 — injetado pela
// montagem (`PLANE_ADMIN_ACTOR_ID`, via `criarZelador`); ausente ou inválido, nada destrava.
const autorDaMesa = valor => (UUID.test(String(valor ?? '').trim()) ? String(valor).trim() : null);

export class JobZelador {
  // F4b: `servico` (RegistroGate.validar ao vivo), `elegibilidadeGate` e `cartaReservada` (item 9).
  constructor({ jobId, projeto, pasta, tupla, frotaCongelada, play, leases, diario, retrato, cli, git, escritor, estado, pausas,
    consultar, comTrava, agora, ocupacao = async () => ({ ocupado: false, motivo: null }), aoFase = () => {},
    servico = null, elegibilidadeGate = async () => ({ ok: false, motivo: 'gate do zelador não configurado' }), cartaReservada = null,
    autorDecisao = null }) {
    Object.assign(this, { jobId, projeto, pasta, tupla, frotaCongelada, play, leases, diario, retrato, cli, git, escritor, estado, pausas, consultar, comTrava, agora, ocupacao, aoFase,
      servico, cartaReservada, autorDecisao: autorDaMesa(autorDecisao) });
    this.renovacaoFalhou = false;
    this.estados = [];
    this.aplicacao = new AplicacaoZelador({ job: this });
    this.gate = new GateZelador({ job: this, elegibilidade: elegibilidadeGate });
  }

  sobFencing(acao) {
    return this.comTrava(async () => {
      if (this.renovacaoFalhou) throw new Error('renovação do lease do zelador falhou; escritas abortadas');
      await this.leases.conferirSobTrava(this.jobId, this.projeto.plane);
      return acao();
    });
  }

  async anotar(evento) { return this.diario.anotar({ jobId: this.jobId, projetoId: this.projeto.plane, ...evento }); }

  async reconciliar(pendentes, { soRecibos }) {
    for (const p of pendentes) {
      const r = await this.aplicacao.reconciliar(p, { soRecibos });
      await this.anotar({ tipo: 'RECONCILIADO', chave: p.chave, carta: p.carta, resultado: r.resultado, motivo: r.reconciliado });
    }
    return pendentes.length;
  }

  // Falha da CLI: `limite` pausa o provedor (todos), `cli` pausa a versão só no bloco zelador (J61).
  async pausarPelaFalha(falha) {
    if (falha.causa === 'limite') {
      const ate = await this.comTrava(() => this.pausas.pausarProvedor(this.tupla.provedor, 60, 'limite de uso do provedor (zelador)'));
      await this.anotar({ tipo: 'PAUSA', causa: 'limite', ate, motivo: `limite de uso de ${this.tupla.provedor} (todos os blocos)` });
    } else if (falha.causa === 'cli') {
      await this.comTrava(() => this.pausas.pausarVersao(this.frotaCongelada, `CLI ou modelo ${this.tupla.provedor} impedido no zelador`, 'zelador'));
      await this.anotar({ tipo: 'PAUSA', causa: 'cli', motivo: `zelador da frota v${this.frotaCongelada.versao} pausado: CLI ou modelo impedido` });
    }
  }

  async rodar() {
    const pid = this.projeto.plane;
    const pendentes = (await this.diario.pendentes()).filter(p => p.projetoId === pid);
    const soRecibos = !(await this.play.ligado(pid));
    if (soRecibos && !pendentes.length) return { resultado: 'PLAY_DESLIGADO', motivo: 'play desligado entre a escolha do projeto e o job' };
    this.aoFase('identidade');
    try { await this.escritor.conferir(pid, { soRecibos }); }
    catch (erro) { return { resultado: 'SEM_IDENTIDADE', motivo: erro.message }; }
    this.aoFase('reconciliando');
    this.estados = await todas(this.consultar, `/projects/${pid}/states/`);
    const reconciliados = await this.reconciliar(pendentes, { soRecibos });
    if (!(await this.play.ligado(pid))) {
      return { resultado: 'PLAY_DESLIGADO', reconciliados, motivo: soRecibos ? 'play desligado: só os recibos dos PENDENTES foram fechados' : 'play suspenso ou desligado na reconciliação; sem retrato nem CLI' };
    }
    this.aoFase('retrato');
    this.r = await this.retrato.montar(this.projeto, this.pasta, this.agora());
    for (const i of this.r.intocaveis) await this.anotar({ tipo: 'INTOCAVEL', carta: i.carta, cartaId: i.cartaId, motivo: i.motivo });
    const contagem = { MANTER: 0, aplicados: 0, recusados: 0, abortados: 0, preparadosSemGate: 0, preparadosGateIncerto: 0 };
    if (this.r.candidatas.length) {
      this.aoFase('cli');
      const falha = await this.consultarCli(contagem);
      if (falha) return falha;
    }
    this.aoFase('fim');
    const { cartas } = await this.retrato.cartasDoProjeto(this.projeto);
    const fim = nadaFazivel({ cartas, sigla: this.projeto.sigla, ramosNaoIntegrados: await this.git.ramosNaoIntegrados(this.pasta) });
    return { resultado: 'CONCLUIDO', reconciliados, candidatas: this.r.candidatas.length, intocaveis: this.r.intocaveis.length, contagem, fim };
  }

  // Devolve o resultado do job quando ele termina aqui (falha da CLI ou saída inválida); null segue.
  async consultarCli(contagem) {
    const saida = await this.cli.rodar(this.tupla, promptZelador(this.r.texto));
    await this.anotar({ tipo: 'CLI', ok: saida.ok, ...(saida.ok ? { uso: saida.uso } : { causa: saida.causa, motivo: String(saida.motivo).slice(0, 200) }),
      provedor: this.tupla.provedor, modelo: this.tupla.modelo, esforco: this.tupla.esforco });
    if (!saida.ok) { await this.pausarPelaFalha(saida); return { resultado: 'CLI_FALHOU', causa: saida.causa, motivo: saida.motivo }; }
    let propostos;
    try { propostos = lerSaidaCli(saida.texto); }
    catch (erro) { return { resultado: 'SAIDA_INVALIDA', causa: 'carta', motivo: erro.message }; }
    const candidatas = new Set(this.r.candidatas.map(c => this.r.identificador(c)));
    const vistos = new Set();
    this.aoFase('aplicando');
    for (const bruto of propostos) {
      const v = await validarVeredito(bruto, { cartasPorIdentificador: this.r.porIdentificador, candidatas, git: this.git, pasta: this.pasta });
      if (v.identificador && vistos.has(v.identificador)) { await this.anotar({ tipo: 'VEREDITO', carta: v.identificador, veredito: 'MANTER', motivo: 'veredito repetido para a carta' }); continue; }
      if (v.identificador) vistos.add(v.identificador);
      if (v.veredito === 'MANTER') {
        contagem[v.recusado ? 'recusados' : 'MANTER'] += 1;
        await this.anotar({ tipo: 'VEREDITO', carta: v.identificador, veredito: 'MANTER', ...(v.proposto && v.proposto !== 'MANTER' ? { proposto: v.proposto } : {}), ...(v.recusado ? { motivo: v.recusado } : {}) });
        continue;
      }
      // J66: o play é conferido antes de começar a sequência desta carta; B9: a ocupação também.
      if (!(await this.play.ligado(this.projeto.plane))) { await this.anotar({ tipo: 'PLAY_DESLIGADO', motivo: 'play desligado ou suspenso; o job não começa outra carta' }); break; }
      const ocupado = await this.ocupacao({ projeto: this.projeto, cartas: new Set(this.r.cartas.map(c => c.id)) })
        .catch(e => ({ ocupado: true, motivo: `ocupação ilegível: ${e.message}` }));
      if (ocupado.ocupado) { await this.anotar({ tipo: 'OCUPADO', motivo: `${ocupado.motivo}; o job não começa outra carta` }); break; }
      // PRONTA (F4b) vai ao portão do gate; o resto, à lista fechada da limpeza.
      const r = v.veredito === 'PRONTA' ? await this.gate.aplicar(v) : await this.aplicacao.aplicar(v);
      await this.anotar({ tipo: 'VEREDITO', carta: v.identificador, veredito: v.veredito, resultado: r.resultado, ...(r.motivo ? { motivo: r.motivo } : {}) });
      if (r.resultado === 'APLICADO') contagem.aplicados += 1;
      else if (r.resultado === 'MANTER') contagem.recusados += 1;
      // D12 (PAINEL-62): escreveu o preparo e o gate não saiu — nem MANTER nem abortado.
      else if (r.resultado === 'PREPARADO_SEM_GATE') contagem.preparadosSemGate += 1;
      else if (r.resultado === 'PREPARADO_GATE_INCERTO') contagem.preparadosGateIncerto += 1;
      else contagem.abortados += 1;
      if (r.resultado === 'DIVERGENTE') break;
    }
    return null;
  }
}
