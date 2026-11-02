// Agendador do zelador: a cada N minutos escolhe o projeto com play que espera há mais tempo, confere frota, pausas, teto, consumo e ocupação, toma os leases e roda UM job. Não decide veredito.
//
// J40/J71: cede com o consumo do provedor ≥ 85% e para quando a leitura mais nova da fonte tem
// mais de 6 h (sem fonte, não roda às cegas). J73: a fila é justa (quem teve a vez há mais
// tempo vai primeiro, pelo diário), o teto diário conta do diário, e no arranque todo job sem
// fim vira JOB_INTERROMPIDO — o droid não fica fantasma — e os leases dele são soltos. Só a
// instância com a trava do agendador chama `recuperar` e agenda (J52). Projeto elegível com
// PENDENTE e play desligado ou suspenso vai primeiro, num job que só fecha recibos, sem CLI nem
// consumo (B13). Só o provedor claude roda no bloco zelador (B27): a sandbox bwrap da F4b embrulha as
// CLIs do executor, não a do zelador, e o Codex só-leitura leria o disco.
import { randomUUID } from 'node:crypto';
import { pastaDoContrato, RAIZ, todas } from './contrato-local.js';
import { projecaoDaLinha } from './zelador-diario.js';

const CONSUMO_CEDE_EM = 85;
// B27: o Codex sob `--sandbox read-only` LÊ o disco (o token do zelador incluído); a CLI do zelador não vai ao bwrap.
const PROVEDORES_ZELADOR = Object.freeze(['claude']);
const CONSUMO_INDISPONIVEL_MAX_MS = 6 * 60 * 60_000;

// { seguir, motivo, consumo } a partir do leitor de consumo da aba (consumo.js).
function avaliarConsumo(leitura, provedor, agoraMs) {
  const r = leitura?.[provedor];
  const amostras = r?.disponivel ? (r.janelas ?? []) : [...(r?.ultimasLeituras ?? []), ...(r?.ultimaLeitura ? [r.ultimaLeitura] : [])];
  const instantes = amostras.map(a => Date.parse(a.atualizadoEm)).filter(Number.isFinite);
  if (!instantes.length) return { seguir: false, motivo: `consumo de ${provedor} sem leitura nenhuma; o zelador não roda às cegas`, consumo: { disponivel: false } };
  const maisNova = Math.max(...instantes);
  const pico = Math.max(...amostras.map(a => a.percentual).filter(Number.isFinite), 0);
  const consumo = { disponivel: Boolean(r?.disponivel), percentual: pico, leituraEm: new Date(maisNova).toISOString() };
  if (agoraMs - maisNova > CONSUMO_INDISPONIVEL_MAX_MS) return { seguir: false, motivo: `consumo de ${provedor} sem leitura há mais de 6 h`, consumo };
  if (pico >= CONSUMO_CEDE_EM) return { seguir: false, motivo: `consumo de ${provedor} em ${pico}% (≥ ${CONSUMO_CEDE_EM}%): o zelador cede`, consumo };
  return { seguir: true, motivo: null, consumo };
}

// O último job de cada projeto para a nave (PAINEL-61). `ultimoJob` é o último JOB_FIM, de qualquer
// resultado; o fim (categorias) e a contagem são do último que terminou com eles; `prontaRecusadas`
// são os PRONTA do último job que não viraram gate, inclusive os rebaixados pela validação.
// Linhas em ordem cronológica; um job só vê os vereditos do seu jobId.
function resumoPorProjeto(linhas) {
  const porProjeto = {};
  const vereditos = new Map();
  const recusada = l => l.tipo === 'VEREDITO' && ((l.veredito === 'PRONTA' && l.resultado !== 'APLICADO') || (l.veredito === 'MANTER' && l.proposto === 'PRONTA'));
  // JOB_INTERROMPIDO (gravado pelo recuperar no arranque) também encerra o job, para a tela.
  const fecha = l => l.tipo === 'JOB_FIM' || l.tipo === 'JOB_INTERROMPIDO';
  for (const l of linhas) {
    if (l.tipo === 'JOB_INICIO') vereditos.set(l.jobId, []);
    else if (recusada(l)) vereditos.get(l.jobId)?.push({ carta: l.carta, resultado: l.veredito === 'PRONTA' ? l.resultado ?? null : 'REBAIXADA',
      motivo: typeof l.motivo === 'string' ? l.motivo.slice(0, 200) : null });
    else if (fecha(l)) {
      const antes = porProjeto[l.projetoId] ?? {};
      // O retrato e a contagem levam a data do job que os produziu: nunca aparecem como do job seguinte.
      const retrato = l.tipo === 'JOB_FIM' && l.fim ? { quando: l.quando, ...l.fim, ...(l.contagem ? { contagem: l.contagem } : {}) } : antes.retrato ?? null;
      porProjeto[l.projetoId] = { retrato,
        ultimoJob: { quando: l.quando, resultado: l.tipo === 'JOB_INTERROMPIDO' ? 'INTERROMPIDO' : l.resultado ?? null, inicioLido: vereditos.has(l.jobId) },
        prontaRecusadas: (vereditos.get(l.jobId) ?? []).slice(0, 10) };
    }
  }
  return porProjeto;
}

export class AgendadorZelador {
  constructor({ servico, play, diario, leases, fabricaJob, lerConsumo, ocupacao, consultar, raiz = RAIZ, intervaloMs = 30 * 60_000, tetoDia = 12,
    primeiraVoltaMs = 2 * 60_000, agora = Date.now, registrarLog = () => {} }) {
    Object.assign(this, { servico, play, diario, leases, fabricaJob, lerConsumo, ocupacao, consultar, raiz, intervaloMs, tetoDia, primeiraVoltaMs, agora, registrarLog });
    this.atual = null;
    this.ultimoMotivo = null;
    this.temporizador = null;
    this.proximoEm = null;
  }

  async recuperar() {
    for (const j of await this.diario.jobsAbertos()) {
      await this.diario.anotar({ tipo: 'JOB_INTERROMPIDO', jobId: j.jobId, projetoId: j.projetoId, motivo: 'o painel caiu ou reiniciou durante o job' });
      await this.leases.soltar(j.jobId, j.projetoId);
    }
  }

  ocioso(motivo) { this.ultimoMotivo = motivo; return { rodou: false, motivo }; }

  async escolher(candidatos) {
    const vez = await this.diario.ultimaVezPorProjeto();
    return [...candidatos].sort((a, b) => String(vez.get(a.plane) ?? '').localeCompare(String(vez.get(b.plane) ?? '')))[0];
  }

  async rodarUmaVez() {
    if (this.atual) return this.ocioso('job do zelador em curso');
    const frota = await this.servico.lerFrota();
    const tupla = frota?.conteudo?.zelador?.zelador;
    if (!tupla || frota.zelador?.estado !== 'ok') return this.ocioso(`frota do zelador ${frota?.zelador?.estado ?? frota?.estado ?? 'ausente'}: nenhum job sem frota válida`);
    if (!PROVEDORES_ZELADOR.includes(tupla.provedor)) return this.ocioso(`o zelador só aceita o provedor claude (bloco zelador em ${tupla.provedor}; a CLI dele não roda sob o bwrap)`);
    const congelada = Object.freeze({ versao: frota.versao, hash: frota.hash, tuplas: Object.freeze({ zelador: tupla }) });
    const pausa = this.servico.pausasFrota.impedimento(await this.servico.pausasFrota.ler(), congelada, 'zelador');
    if (pausa) return this.ocioso(pausa);
    let feitos;
    try { feitos = await this.diario.jobs24h(); } catch (e) { return this.ocioso(`diário do zelador ilegível: ${e.message}`); }
    if (feitos >= this.tetoDia) return this.ocioso(`teto diário de jobs atingido (${feitos}/${this.tetoDia})`);
    const candidatos = await this.play.ligados();
    let comPendente;
    try { comPendente = new Set((await this.diario.pendentes()).map(p => p.projetoId)); }
    catch (e) { return this.ocioso(`índice de pendentes do zelador ilegível: ${e.message}`); }
    const soRecibos = this.play.projetos.filter(p => comPendente.has(p.plane) && !candidatos.some(c => c.plane === p.plane));
    if (!candidatos.length && !soRecibos.length) return this.ocioso('nenhum projeto com play ligado');
    const projeto = soRecibos[0] ?? await this.escolher(candidatos);
    const pular = async motivo => { await this.diario.anotar({ tipo: 'JOB_PULADO', projetoId: projeto.plane, motivo }); return this.ocioso(`${projeto.sigla}: ${motivo}`); };
    const consumo = soRecibos.length ? { seguir: true, consumo: null } : avaliarConsumo(await this.lerConsumo().catch(() => null), tupla.provedor, this.agora());
    if (!consumo.seguir) return pular(consumo.motivo);
    let ids;
    try { ids = (await todas(this.consultar, `/projects/${projeto.plane}/work-items/`)).map(c => c.id); }
    catch (e) { return pular(`cartas ilegíveis no Plane: ${e.message}`); }
    const ocupado = await this.ocupacao({ projeto, cartas: new Set(ids) });
    if (ocupado.ocupado) return pular(`ocupado: ${ocupado.motivo}`);
    const jobId = randomUUID();
    const lease = await this.leases.adquirir(jobId, projeto.plane);
    if (!lease.ok) return pular(lease.motivo);
    return this.executar({ jobId, projeto, tupla, congelada, consumo: consumo.consumo });
  }

  async executar({ jobId, projeto, tupla, congelada, consumo }) {
    const pasta = pastaDoContrato(projeto, this.raiz);
    this.atual = { jobId, projetoId: projeto.plane, pasta: projeto.pasta, sigla: projeto.sigla, provedor: tupla.provedor, fase: 'inicio', desde: new Date(this.agora()).toISOString() };
    this.ultimoMotivo = null;
    const job = this.fabricaJob({ jobId, projeto, pasta, tupla, frotaCongelada: congelada, aoFase: fase => { if (this.atual?.jobId === jobId) this.atual.fase = fase; } });
    const renovador = setInterval(() => { this.leases.renovar(jobId, projeto.plane).catch(() => { job.renovacaoFalhou = true; }); }, 5 * 60_000);
    renovador.unref?.();
    let resultado;
    try {
      await this.diario.anotar({ tipo: 'JOB_INICIO', jobId, projetoId: projeto.plane, provedor: tupla.provedor, modelo: tupla.modelo, frotaVersao: congelada.versao, consumo });
      resultado = await job.rodar();
      await this.diario.anotar({ tipo: 'JOB_FIM', jobId, projetoId: projeto.plane, resultado: resultado.resultado,
        ...(resultado.causa ? { causa: resultado.causa } : {}), ...(resultado.motivo ? { motivo: String(resultado.motivo).slice(0, 200) } : {}),
        ...(resultado.contagem ? { contagem: resultado.contagem } : {}), ...(resultado.fim ? { fim: resultado.fim } : {}) });
    } catch (erro) {
      resultado = { resultado: 'ERRO', motivo: erro.message };
      this.registrarLog(`[zelador] job em ${projeto.pasta} falhou: ${erro.message}`);
      await this.diario.anotar({ tipo: 'JOB_FIM', jobId, projetoId: projeto.plane, resultado: 'ERRO', motivo: String(erro.message).slice(0, 200) }).catch(() => {});
    } finally {
      clearInterval(renovador);
      this.atual = null;
      await this.leases.soltar(jobId, projeto.plane).catch(e => this.registrarLog(`[zelador] lease não solto: ${e.message}`));
    }
    return { rodou: true, jobId, projetoId: projeto.plane, ...resultado };
  }

  async estado() {
    let linhas = [];
    let avisos = [];
    let jobsHoje = null;
    try { ({ linhas, avisos } = await this.diario.linhas({ janelaMs: 3 * 24 * 60 * 60_000 })); jobsHoje = await this.diario.jobs24h(); }
    catch (e) { avisos = [`diário do zelador ilegível: ${e.message}`]; }
    const motivoOcioso = !this.atual && this.ultimoMotivo === 'job do zelador em curso' ? null : this.ultimoMotivo;
    return { atual: this.atual, motivoOcioso, intervaloMinutos: Math.round(this.intervaloMs / 60_000), tetoDia: this.tetoDia,
      jobsHoje, agendando: Boolean(this.temporizador), proximoEm: this.proximoEm ? new Date(this.proximoEm).toISOString() : null,
      porProjeto: resumoPorProjeto(linhas), avisos, diario: linhas.slice(-60).reverse().map(projecaoDaLinha) };
  }

  // PAINEL-61: a primeira volta sai `primeiraVoltaMs` depois do arranque (antes esperava um
  // intervalo inteiro, 30 min sem sinal na tela), mas nunca antes de um intervalo depois do último
  // JOB_INICIO do diário: o intervalo de 30 min era a contenção implícita contra reinício em laço e
  // contra a CLI órfã de um job interrompido (a CLI vive até 15 min). Diário ilegível não segura a
  // volta: o rodarUmaVez cai ocioso pelo teto ilegível.
  iniciar(podeAgendar = async () => false) {
    if (this.temporizador) return;
    // A primeira volta é assíncrona: um parar() + iniciar() durante o await dela não pode deixar
    // dois laços. Cada iniciar tem a sua geração, e a primeira confere que ainda é a dela.
    const geracao = this.geracao = (this.geracao ?? 0) + 1;
    const minha = () => this.temporizador && this.geracao === geracao;
    const volta = async () => {
      this.proximoEm = this.agora() + this.intervaloMs;
      try { if (await podeAgendar()) await this.rodarUmaVez(); }
      catch (e) { this.registrarLog(`[zelador] ${e.message}`); }
    };
    const primeira = async () => {
      if (!minha()) return;
      const ultimo = await this.ultimoInicioMs().catch(() => null);
      if (!minha()) return;
      const espera = Number.isFinite(ultimo) ? ultimo + this.intervaloMs - this.agora() : 0;
      if (espera > 0) {
        this.proximoEm = this.agora() + espera;
        this.temporizador = setTimeout(primeira, espera);
      } else {
        this.temporizador = setInterval(volta, this.intervaloMs);
        volta();
      }
      this.temporizador.unref?.();
    };
    this.proximoEm = this.agora() + this.primeiraVoltaMs;
    this.temporizador = setTimeout(primeira, this.primeiraVoltaMs);
    this.temporizador.unref?.();
  }

  async ultimoInicioMs() {
    const { linhas } = await this.diario.linhas({ janelaMs: this.intervaloMs });
    const inicios = linhas.filter(l => l.tipo === 'JOB_INICIO').map(l => Date.parse(l.quando)).filter(Number.isFinite);
    return inicios.length ? Math.max(...inicios) : null;
  }

  parar() { if (this.temporizador) { clearTimeout(this.temporizador); clearInterval(this.temporizador); } this.temporizador = null; this.proximoEm = null; this.geracao = (this.geracao ?? 0) + 1; }
}
