// Diário do zelador: um arquivo de acréscimo por dia (`zelador/zelador-AAAA-MM-DD.jsonl`) e o índice de pendentes fora da rotação. Só campos estruturados; não escreve no Plane.
//
// J45–J50 do plano e J62/J73 do parecer de 31/10/2026:
// - o mesmo `anexarJsonl` dos outros diários: cauda interrompida não cola o registro novo;
//   linha cortada no fim é tolerada e avisada, corrupção no meio falha fechada;
// - rotação diária (UTC); quem lê pede uma janela e recebe os dias que a cobrem;
// - `pendentes.jsonl` não roda: uma intenção PENDENTE sem RESOLVIDO sobrevive à virada do dia
//   e é reconciliada no início do próximo job (J62); a verificação que não conferiu fica marcada
//   (DIVERGENTE) antes do recibo, para a reconciliação não a perder (B17); o RESOLVIDO entra no
//   índice só depois da linha do diário (B18);
// - o teto diário e a vez de cada projeto (round-robin) contam daqui, nunca da memória (J52, J73).
import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from './leitor-jsonl.js';

const DIA_MS = 24 * 60 * 60_000;
const CAMPOS_TELA = ['tipo', 'quando', 'jobId', 'projetoId', 'carta', 'veredito', 'proposto', 'resultado', 'causa', 'provedor', 'modelo'];

// O que sai para a tela e para o C-3PO: só campos estruturados, motivo cortado.
export const projecaoDaLinha = l => {
  const e = {};
  for (const c of CAMPOS_TELA) if (typeof l[c] === 'string' || typeof l[c] === 'number' || typeof l[c] === 'boolean') e[c] = l[c];
  if (typeof l.motivo === 'string') e.motivo = l.motivo.slice(0, 200);
  if (l.fim && typeof l.fim === 'object') e.fim = l.fim;
  if (l.contagem && typeof l.contagem === 'object') e.contagem = l.contagem;
  return e;
};

export class DiarioZelador {
  constructor({ diretorio, agora = Date.now }) {
    this.pasta = path.join(diretorio, 'zelador');
    this.indice = path.join(this.pasta, 'pendentes.jsonl');
    this.agora = agora;
  }

  iso() { return new Date(this.agora()).toISOString(); }

  arquivoDoDia(ms) { return path.join(this.pasta, `zelador-${new Date(ms).toISOString().slice(0, 10)}.jsonl`); }

  async anotar(evento) {
    await fs.mkdir(this.pasta, { recursive: true });
    const registro = { quando: this.iso(), ...evento };
    await anexarJsonl(this.arquivoDoDia(this.agora()), registro);
    return registro;
  }

  async lerArquivo(arquivo, nome) {
    let texto;
    try { texto = await fs.readFile(arquivo, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return { linhas: [], truncadaNoFim: false, truncadasNoMeio: 0 }; throw e; }
    return lerJsonl(texto, nome);
  }

  // Linhas dos dias que cobrem a janela, da mais antiga à mais nova. Corrupção no meio lança.
  async linhas({ janelaMs = DIA_MS } = {}) {
    const fim = this.agora();
    const dias = new Set();
    for (let t = fim - janelaMs; t <= fim + 1; t += DIA_MS) dias.add(this.arquivoDoDia(t));
    dias.add(this.arquivoDoDia(fim));
    const linhas = [];
    const avisos = [];
    for (const arquivo of [...dias].sort()) {
      const nome = `diário do zelador ${path.basename(arquivo, '.jsonl').slice(8)}`;
      const r = await this.lerArquivo(arquivo, nome);
      if (r.truncadaNoFim) avisos.push(`${nome}: última linha incompleta ignorada`);
      if (r.truncadasNoMeio) avisos.push(`${nome}: ${r.truncadasNoMeio} linha(s) de escrita interrompida ignorada(s)`);
      linhas.push(...r.linhas);
    }
    const corte = fim - janelaMs;
    return { linhas: linhas.filter(l => Date.parse(l.quando) >= corte), avisos };
  }

  // Job parado pela frota (CLI ou limite de uso) não gasta o teto do dia, como na vigília.
  async jobs24h() {
    const { linhas } = await this.linhas();
    const daFrota = new Set(linhas.filter(l => l.tipo === 'JOB_FIM' && ['cli', 'limite'].includes(l.causa)).map(l => l.jobId));
    return linhas.filter(l => l.tipo === 'JOB_INICIO' && !daFrota.has(l.jobId)).length;
  }

  // Última vez que cada projeto teve a vez (início de job ou pulo), para a fila justa (J73).
  async ultimaVezPorProjeto(janelaMs = 7 * DIA_MS) {
    const vez = new Map();
    for (const l of (await this.linhas({ janelaMs })).linhas) {
      if ((l.tipo === 'JOB_INICIO' || l.tipo === 'JOB_PULADO') && typeof l.projetoId === 'string') vez.set(l.projetoId, l.quando);
    }
    return vez;
  }

  // Jobs que começaram e não terminaram: o processo caiu no meio (J73).
  async jobsAbertos(janelaMs = 2 * DIA_MS) {
    const abertos = new Map();
    for (const l of (await this.linhas({ janelaMs })).linhas) {
      if (l.tipo === 'JOB_INICIO') abertos.set(l.jobId, l);
      if (l.tipo === 'JOB_FIM' || l.tipo === 'JOB_INTERROMPIDO') abertos.delete(l.jobId);
    }
    return [...abertos.values()];
  }

  // W5 (PAINEL-62): o último fechamento de um preparo (veredito PRONTA) desta carta na janela, ou
  // null. Corrupção no meio lança: quem chama recusa (falha fechada).
  async ultimoPreparo(cartaId, janelaMs = DIA_MS) {
    const { linhas } = await this.linhas({ janelaMs });
    return linhas.filter(l => l.cartaId === cartaId && l.veredito === 'PRONTA' && /^ZELADOR_/.test(l.tipo) && l.tipo !== 'ZELADOR_PENDENTE').at(-1) ?? null;
  }

  async marcarPendente(registro) {
    await fs.mkdir(this.pasta, { recursive: true });
    await anexarJsonl(this.indice, { quando: this.iso(), tipo: 'PENDENTE', ...registro });
    await this.anotar({ tipo: 'ZELADOR_PENDENTE', chave: registro.chave, projetoId: registro.projetoId, cartaId: registro.cartaId,
      carta: registro.carta, veredito: registro.veredito, jobId: registro.jobId });
  }

  async marcarDivergente(chave) {
    await fs.mkdir(this.pasta, { recursive: true });
    await anexarJsonl(this.indice, { quando: this.iso(), tipo: 'DIVERGENTE', chave });
  }

  async resolver(chave, resultado, extra = {}) {
    await this.anotar({ tipo: `ZELADOR_${resultado}`, chave, ...extra });
    await anexarJsonl(this.indice, { quando: this.iso(), tipo: 'RESOLVIDO', chave, resultado });
  }

  // PENDENTE sem RESOLVIDO, em qualquer data. O índice ilegível no meio lança: sem saber o que
  // ficou pela metade, nenhum job começa.
  async pendentes() {
    const { linhas } = await this.lerArquivo(this.indice, 'índice de pendentes do zelador');
    const abertos = new Map();
    for (const l of linhas) {
      if (l.tipo === 'PENDENTE') abertos.set(l.chave, l);
      if (l.tipo === 'DIVERGENTE' && abertos.has(l.chave)) abertos.set(l.chave, { ...abertos.get(l.chave), divergente: true });
      if (l.tipo === 'RESOLVIDO') abertos.delete(l.chave);
    }
    return [...abertos.values()];
  }
}
