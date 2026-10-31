// Play por nave: o dono libera a frota para um projeto (zeladoria hoje, despacho pela vigília); presença em play.json = ligado. Não varre nem despacha.
//
// F3 da frota (31/10/2026), no lugar do toggle da vigília por projeto (J11–J14, J66):
// - `play.json` = { [projetoPlaneId]: { desde, usuarioId, suspenso? } }; gravação tmp + rename
//   sempre sob a trava global da orquestração, para o desligar não cruzar uma reserva;
// - ilegível ou de forma estranha = todos desligados, e a tela diz "play ilegível" (J12);
// - "suspenso por divergência" fica gravado e é diferente de desligado: só o dono religa (J66);
// - a leitura não tem cache: quem decide relê (antes de cada carta, dentro da reserva).
// O histórico (`play-historico.jsonl`, só acréscimo) guarda quem ligou; o GET não diz (J73).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { recusa } from './contrato-local.js';
import { anexarJsonl } from './leitor-jsonl.js';

// Fora do play de propósito (J68): Anya tem a verdade no Linear; CKBL tem as identidades
// próprias e a ponte REST; congelado é só leitura.
const SIGLAS_FORA_DO_PLAY = Object.freeze(['ANYA', 'CKBL']);
const elegivelAoPlay = p => Boolean(p?.plane) && !p.congelado && !SIGLAS_FORA_DO_PLAY.includes(p.sigla);

const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const instante = v => typeof v === 'string' && Number.isFinite(Date.parse(v));

function registroValido(r) {
  if (!objeto(r) || !instante(r.desde) || typeof r.usuarioId !== 'string') return false;
  if (Object.keys(r).some(k => !['desde', 'usuarioId', 'suspenso'].includes(k))) return false;
  return r.suspenso === undefined || (objeto(r.suspenso) && instante(r.suspenso.desde) && typeof r.suspenso.motivo === 'string');
}

export class PlayHangar {
  constructor({ diretorio, comTrava, projetos = PROJETOS, agora = Date.now }) {
    if (!diretorio || !comTrava) throw new Error('diretório e trava do play obrigatórios');
    this.diretorio = diretorio;
    this.arquivo = path.join(diretorio, 'play.json');
    this.historico = path.join(diretorio, 'play-historico.jsonl');
    this.marcaMigracao = path.join(diretorio, 'play-migracao.json');
    this.comTrava = comTrava;
    this.projetos = projetos.filter(elegivelAoPlay);
    this.agora = agora;
  }

  iso() { return new Date(this.agora()).toISOString(); }

  async ler() {
    let dados;
    try { dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8')); }
    catch (e) { return e.code === 'ENOENT' ? { legivel: true, registros: {} } : { legivel: false, registros: {} }; }
    const valido = objeto(dados) && Object.values(dados).every(registroValido);
    return valido ? { legivel: true, registros: dados } : { legivel: false, registros: {} };
  }

  projeto(id) {
    const p = this.projetos.find(x => x.plane === id);
    if (!p) throw recusa('projeto fora do play (catálogo com Plane, não congelado, nem Anya nem CKBL)');
    return p;
  }

  situacaoDe(registro) {
    if (!registro) return 'desligado';
    return registro.suspenso ? 'suspenso' : 'ligado';
  }

  // Ligado de verdade: arquivo legível, projeto elegível, presente e não suspenso.
  async ligado(projetoId, leitura = null) {
    const { legivel, registros } = leitura ?? await this.ler();
    if (!legivel || !this.projetos.some(p => p.plane === projetoId)) return false;
    return this.situacaoDe(registros[projetoId]) === 'ligado';
  }

  async ligados() {
    const leitura = await this.ler();
    const lista = [];
    for (const p of this.projetos) if (await this.ligado(p.plane, leitura)) lista.push({ ...p, desdePlay: leitura.registros[p.plane].desde, usuarioId: leitura.registros[p.plane].usuarioId });
    return lista;
  }

  // GET aberto: nunca devolve o usuarioId (J73).
  async estado({ atividade = async () => null } = {}) {
    const { legivel, registros } = await this.ler();
    const projetos = [];
    for (const p of this.projetos) {
      const r = legivel ? registros[p.plane] : null;
      projetos.push({ projeto: p.plane, pasta: p.pasta, titulo: p.titulo, sigla: p.sigla ?? null, situacao: this.situacaoDe(r),
        desde: r?.desde ?? null, suspenso: r?.suspenso ?? null, emCurso: await atividade(p.plane).catch(() => 'atividade ilegível') });
    }
    return { legivel, agora: this.iso(), projetos,
      observacao: legivel ? 'Com o play ligado, o zelador limpa as cartas do projeto sozinho e a vigília despacha as elegíveis; desligar vale para a próxima carta.'
        : 'play ilegível: todos os projetos contam como desligados até o dono religar um deles.' };
  }

  async validar(id, ligar, { atividade = async () => null } = {}) {
    if (typeof ligar !== 'boolean') throw recusa('ação inválida');
    const p = this.projeto(id);
    const { legivel, registros } = await this.ler();
    const atual = legivel ? this.situacaoDe(registros[id]) : 'desligado';
    const emCurso = await atividade(id).catch(() => 'atividade ilegível');
    return { nome: p.titulo, sigla: p.sigla ?? null, ligar, situacao: atual, jaEstava: ligar ? atual === 'ligado' : atual === 'desligado',
      emCurso, aviso: ligar
        ? 'Confirmar liga o play: o zelador passa a limpar as cartas deste projeto sem nova confirmação (comentário com a fonte antes de cada mudança) e a vigília despacha as cartas com gate, dentro dos freios do contrato. Nunca faz push nem merge.'
        : `Confirmar desliga o play agora.${emCurso ? ` Em curso: ${emCurso}; ela termina a carta atual e não começa outra.` : ''}` };
  }

  async gravarSobTrava(novos) {
    await fs.mkdir(this.diretorio, { recursive: true });
    const temporario = `${this.arquivo}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporario, JSON.stringify(novos), { flag: 'wx' });
      await fs.rename(temporario, this.arquivo);
    } finally { await fs.rm(temporario, { force: true }).catch(() => {}); }
  }

  // Ligar religa também o suspenso (a saída explícita da divergência); ilegível é regravado do zero.
  alternar(id, ligar, usuarioId) {
    return this.comTrava(async () => {
      const p = this.projeto(id);
      const { legivel, registros } = await this.ler();
      const novos = legivel ? { ...registros } : {};
      if (ligar) novos[id] = { desde: this.iso(), usuarioId: String(usuarioId) };
      else delete novos[id];
      await this.gravarSobTrava(novos);
      await this.anotar({ tipo: ligar ? 'LIGADO' : 'DESLIGADO', projetoId: id, usuarioId: String(usuarioId), ...(legivel ? {} : { regravouIlegivel: true }) });
      return { nome: p.titulo, projeto: id, situacao: this.situacaoDe(novos[id]), desde: novos[id]?.desde ?? null };
    });
  }

  elegivel(id) { return this.projetos.some(p => p.plane === id); }

  // Quem chama já segura a trava (o zelador, ao achar divergência na verificação). Sem play
  // (desligado ou ilegível) não há o que suspender, mas a tentativa fica no histórico (B24).
  async suspenderSobTrava(id, motivo) {
    const { legivel, registros } = await this.ler();
    if (!legivel || !registros[id]) {
      await this.anotar({ tipo: 'SUSPENSAO_SEM_PLAY', projetoId: id, play: legivel ? 'desligado' : 'ilegível', motivo: String(motivo).slice(0, 300) });
      return false;
    }
    if (registros[id].suspenso) return true;
    await this.gravarSobTrava({ ...registros, [id]: { ...registros[id], suspenso: { desde: this.iso(), motivo: String(motivo).slice(0, 300) } } });
    await this.anotar({ tipo: 'SUSPENSO', projetoId: id, motivo: String(motivo).slice(0, 300) });
    return true;
  }

  suspender(id, motivo) { return this.comTrava(() => this.suspenderSobTrava(id, motivo)); }

  async anotar(evento) {
    await fs.mkdir(this.diretorio, { recursive: true });
    await anexarJsonl(this.historico, { quando: this.iso(), ...evento });
  }

  // Migração do toggle antigo (resposta à P2): uma vez, marcada por arquivo, sob a trava e antes
  // de a vigília agendar. Nada é ligado: cada `vigilia/<id>.json` é renomeado e anotado; o
  // ilegível também. O `vigilia/<id>.jsonl` fica, porque alimenta o teto diário.
  migrar() {
    return this.comTrava(async () => {
      try { await fs.access(this.marcaMigracao); return { feita: false, motivo: 'já migrado' }; }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      const pasta = path.join(this.diretorio, 'vigilia');
      let nomes = [];
      try { nomes = await fs.readdir(pasta); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      const data = this.iso().slice(0, 10);
      const migrados = [];
      for (const nome of nomes.filter(n => /^[0-9a-f-]{36}\.json$/i.test(n))) {
        const projetoId = nome.slice(0, -5);
        let estavaLigada = null;
        try { estavaLigada = Boolean(JSON.parse(await fs.readFile(path.join(pasta, nome), 'utf8'))?.ligada); }
        catch { estavaLigada = 'ilegivel'; }
        await fs.rename(path.join(pasta, nome), path.join(pasta, `${nome}.migrado-${data}`));
        await this.anotar({ tipo: 'MIGRACAO_VIGILIA', projetoId, estavaLigada, observacao: 'toggle antigo renomeado; nada foi ligado no play' });
        migrados.push({ projetoId, estavaLigada });
      }
      await fs.mkdir(this.diretorio, { recursive: true });
      await fs.writeFile(this.marcaMigracao, JSON.stringify({ quando: this.iso(), migrados }), { flag: 'wx' });
      return { feita: true, migrados };
    });
  }
}
