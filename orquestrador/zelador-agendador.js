// Agendador do zelador: a cada N minutos escolhe o projeto com play que espera há mais tempo, confere frota, pausas, teto, consumo e ocupação, toma os leases e roda UM job. Não decide veredito.
//
// J40/J71: cede com o consumo do provedor ≥ 85% e para quando a leitura mais nova da fonte tem
// mais de 6 h (sem fonte, não roda às cegas). J73: a fila é justa (quem teve a vez há mais
// tempo vai primeiro, pelo diário), o teto diário conta do diário, e no arranque todo job sem
// fim vira JOB_INTERROMPIDO — o droid não fica fantasma — e os leases dele são soltos. Só a
// instância com a trava do agendador chama `recuperar` e agenda (J52).
import { randomUUID } from 'node:crypto';
import { pastaDoContrato, RAIZ, todas } from './contrato-local.js';
import { projecaoDaLinha } from './zelador-diario.js';

const CONSUMO_CEDE_EM = 85;
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

export class AgendadorZelador {
  constructor({ servico, play, diario, leases, fabricaJob, lerConsumo, ocupacao, consultar, raiz = RAIZ, intervaloMs = 30 * 60_000, tetoDia = 12,
    agora = Date.now, registrarLog = () => {} }) {
    Object.assign(this, { servico, play, diario, leases, fabricaJob, lerConsumo, ocupacao, consultar, raiz, intervaloMs, tetoDia, agora, registrarLog });
    this.atual = null;
    this.ultimoMotivo = null;
    this.temporizador = null;
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
    const congelada = Object.freeze({ versao: frota.versao, hash: frota.hash, tuplas: Object.freeze({ zelador: tupla }) });
    const pausa = this.servico.pausasFrota.impedimento(await this.servico.pausasFrota.ler(), congelada, 'zelador');
    if (pausa) return this.ocioso(pausa);
    let feitos;
    try { feitos = await this.diario.jobs24h(); } catch (e) { return this.ocioso(`diário do zelador ilegível: ${e.message}`); }
    if (feitos >= this.tetoDia) return this.ocioso(`teto diário de jobs atingido (${feitos}/${this.tetoDia})`);
    const candidatos = await this.play.ligados();
    if (!candidatos.length) return this.ocioso('nenhum projeto com play ligado');
    const projeto = await this.escolher(candidatos);
    const pular = async motivo => { await this.diario.anotar({ tipo: 'JOB_PULADO', projetoId: projeto.plane, motivo }); return this.ocioso(`${projeto.sigla}: ${motivo}`); };
    const consumo = avaliarConsumo(await this.lerConsumo().catch(() => null), tupla.provedor, this.agora());
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
    const porProjeto = {};
    for (const l of linhas) if (l.tipo === 'JOB_FIM' && l.fim) porProjeto[l.projetoId] = { quando: l.quando, ...l.fim };
    return { atual: this.atual, motivoOcioso: this.ultimoMotivo, intervaloMinutos: Math.round(this.intervaloMs / 60_000), tetoDia: this.tetoDia,
      jobsHoje, agendando: Boolean(this.temporizador), porProjeto, avisos, diario: linhas.slice(-60).reverse().map(projecaoDaLinha) };
  }

  iniciar(podeAgendar = async () => false) {
    if (this.temporizador) return;
    this.temporizador = setInterval(async () => {
      try { if (await podeAgendar()) await this.rodarUmaVez(); }
      catch (e) { this.registrarLog(`[zelador] ${e.message}`); }
    }, this.intervaloMs);
    this.temporizador.unref?.();
  }

  parar() { if (this.temporizador) clearInterval(this.temporizador); this.temporizador = null; }
}
