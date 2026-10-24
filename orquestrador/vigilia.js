// Vigília (decisão do dono, 24/10/2026): com um projeto ligado, o Painel varre a fila a cada
// intervalo e, havendo carta elegível, despacha sozinho — a mesma tentativa que o botão
// "Confirmar tentativa real" dispararia, com os mesmos portões (gate verificado, contrato,
// agente, lease) e o mesmo executor. O que muda é a confirmação: deixa de ser por carta e
// passa a ser por projeto (ligar a vigília exige sessão do Cadastro Único e confirmação).
// Freios, por contrato: uma tentativa por vez no projeto, N tentativas por carta, teto por
// dia e pausa automática quando o provedor devolve limite de uso. Avanço: READY TO DEV
// concluído vira READY TO TEST (recibo GATE/v1 com o resultado); READY TO TEST concluído
// vira Done. Nunca push, nunca merge: o ramo orq/… fica para revisão humana.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJETOS } from '../projetos.js';
import { configuracaoVigilia } from './politica.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITE_DE_USO = /limite de uso do provedor|usage limit|rate limit|too many requests/i;
const DIA_MS = 24 * 60 * 60_000;
const GATES = ['READY TO DEV', 'READY TO TEST'];

function recusa(mensagem) { const e = new Error(mensagem); e.semEscrita = true; return e; }

export function criarVigilia({ servico, diretorioEstado, projetos = PROJETOS, agora = Date.now, intervaloMs = 120_000,
  registrarLog = () => {} } = {}) {
  if (!servico || !diretorioEstado) throw new Error('serviço e diretório de estado obrigatórios');
  const pasta = path.join(diretorioEstado, 'vigilia');
  const arquivoConfig = id => path.join(pasta, `${id}.json`);
  const arquivoDiario = id => path.join(pasta, `${id}.jsonl`);
  const memoria = new Map();
  let varrendo = false;
  let temporizador = null;
  const iso = () => new Date(agora()).toISOString();

  async function lerConfig(id) {
    try { return JSON.parse(await fs.readFile(arquivoConfig(id), 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return { ligada: false }; throw e; }
  }
  async function gravarConfig(id, cfg) {
    await fs.mkdir(pasta, { recursive: true });
    const temporario = `${arquivoConfig(id)}.${randomUUID()}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(cfg), { flag: 'wx' });
    await fs.rename(temporario, arquivoConfig(id));
  }
  async function anotar(id, evento) {
    await fs.mkdir(pasta, { recursive: true });
    await fs.appendFile(arquivoDiario(id), `${JSON.stringify({ quando: iso(), ...evento })}\n`, 'utf8');
  }
  async function diario(id) {
    try { return (await fs.readFile(arquivoDiario(id), 'utf8')).split('\n').filter(Boolean).map(JSON.parse); }
    catch (e) { if (e.code === 'ENOENT') return []; throw new Error('diário da vigília ilegível'); }
  }
  async function tentativasNasUltimas24h(id) {
    const limite = agora() - DIA_MS;
    return (await diario(id)).filter(e => e.tipo === 'TENTATIVA' && Date.parse(e.quando) > limite).length;
  }
  function projeto(id) {
    const p = projetos.find(x => x.plane === id);
    if (!p) throw recusa('projeto fora do catálogo');
    return p;
  }

  async function situacao(p) {
    const id = p.plane;
    const [{ contrato, erros }, local, feitas] = await Promise.all([servico.contrato(id), lerConfig(id), tentativasNasUltimas24h(id)]);
    const cfg = configuracaoVigilia(contrato);
    const impedimentos = [];
    if (!contrato) impedimentos.push('contrato local ausente');
    else if (erros.length) impedimentos.push(...erros.map(x => `contrato: ${x}`));
    else if (!cfg) impedimentos.push('contrato sem bloco vigilia');
    if (!servico.podeDespachar(id)) impedimentos.push('executor desligado ou identidade de escrita ausente');
    const pausadaAte = local.pausadaAte && Date.parse(local.pausadaAte) > agora() ? local.pausadaAte : null;
    const lembranca = memoria.get(id) ?? {};
    return { projetoId: id, pasta: p.pasta, nome: p.titulo ?? p.nome ?? p.pasta, temContrato: Boolean(contrato),
      ligada: Boolean(local.ligada), ligadaPor: local.ligadaPor ?? null, desde: local.desde ?? null,
      pausadaAte, motivoPausa: pausadaAte ? local.motivoPausa ?? null : null,
      tentativasHoje: feitas, limites: cfg ? { maxTentativasPorCarta: cfg.maxTentativasPorCarta, tetoPorDia: cfg.tetoPorDia,
        pausaPorLimiteMinutos: cfg.pausaPorLimiteMinutos, comando: cfg.comando } : null,
      perfilPadrao: cfg?.perfilPadrao ?? null, impedimentos,
      ultimaVarredura: lembranca.ultimaVarredura ?? null, proximaCarta: lembranca.proximaCarta ?? null,
      motivoOciosa: lembranca.motivoOciosa ?? null, diario: (await diario(id)).slice(-20).reverse() };
  }

  async function estadoDaVigilia() {
    const lista = [];
    for (const p of projetos.filter(x => x.plane)) {
      const s = await situacao(p);
      if (s.temContrato) lista.push(s);
    }
    return { atualizadoEm: iso(), intervaloSegundos: Math.round(intervaloMs / 1000), varrendo, projetos: lista,
      observacao: 'A vigília despacha sozinha as cartas elegíveis do projeto ligado, uma por vez, com os mesmos portões do despacho manual; ligar exige sessão e confirmação. Nunca faz push nem merge.' };
  }

  async function validarAlternancia(projetoId, ligar) {
    if (!UUID.test(projetoId ?? '') || typeof ligar !== 'boolean') throw recusa('projeto ou ação inválidos');
    const s = await situacao(projeto(projetoId));
    if (ligar && s.impedimentos.length) throw recusa(`vigília não pode ser ligada: ${s.impedimentos.join('; ')}`);
    return { projetoId, nome: s.nome, ligar, jaEstava: s.ligada === ligar, limites: s.limites, perfilPadrao: s.perfilPadrao,
      aviso: ligar ? 'Confirmar liga a varredura automática: cartas elegíveis deste projeto serão despachadas sem nova confirmação, dentro dos freios do contrato.'
        : 'Confirmar desliga a varredura; uma tentativa já em curso termina e grava o resultado.' };
  }

  async function alternar(projetoId, ligar, usuarioId) {
    const dados = await validarAlternancia(projetoId, ligar);
    const anterior = await lerConfig(projetoId);
    await gravarConfig(projetoId, { ligada: ligar, ligadaPor: ligar ? String(usuarioId) : anterior.ligadaPor ?? null,
      desde: iso(), pausadaAte: null, motivoPausa: null });
    await anotar(projetoId, { tipo: ligar ? 'LIGADA' : 'DESLIGADA', usuarioId: String(usuarioId) });
    return { ...dados, ligada: ligar };
  }

  async function pausar(projetoId, minutos, motivo) {
    const atual = await lerConfig(projetoId);
    const ate = new Date(agora() + minutos * 60_000).toISOString();
    await gravarConfig(projetoId, { ...atual, pausadaAte: ate, motivoPausa: motivo });
    await anotar(projetoId, { tipo: 'PAUSA', ate, motivo });
    return ate;
  }

  async function reler(cartaId) {
    return (await servico.fila()).itens.find(x => x.id === cartaId) ?? null;
  }

  async function varrerProjeto(p, local) {
    const id = p.plane;
    const nota = campos => { memoria.set(id, { ...memoria.get(id), ultimaVarredura: iso(), ...campos }); return { projetoId: id, ...memoria.get(id) }; };
    if (local.pausadaAte && Date.parse(local.pausadaAte) > agora()) return nota({ motivoOciosa: `pausada até ${local.pausadaAte}: ${local.motivoPausa ?? ''}`.trim() });
    const { contrato, erros } = await servico.contrato(id);
    const cfg = configuracaoVigilia(contrato);
    if (!cfg || erros.length) return nota({ motivoOciosa: 'contrato sem vigília válida' });
    if (!servico.podeDespachar(id)) return nota({ motivoOciosa: 'executor desligado ou identidade de escrita ausente' });
    const feitas = await tentativasNasUltimas24h(id);
    if (feitas >= cfg.tetoPorDia) return nota({ motivoOciosa: `teto diário atingido (${feitas}/${cfg.tetoPorDia})` });
    const doProjeto = (await servico.fila()).itens.filter(i => i.projetoId === id);
    if (doProjeto.some(i => i.leaseSituacao === 'ativo')) return nota({ motivoOciosa: 'tentativa em curso (lease ativo)' });
    const tentativasDe = item => (item.historico ?? []).filter(e => e.tipo === 'TENTATIVA').length;
    const candidatas = doProjeto.filter(i => i.elegivel && GATES.includes(i.gate) && tentativasDe(i) < cfg.maxTentativasPorCarta);
    if (!candidatas.length) return nota({ motivoOciosa: 'nenhuma carta elegível', proximaCarta: null });
    let carta = candidatas[0];
    nota({ proximaCarta: carta.identificador, motivoOciosa: null });
    const gate = carta.gate;
    // Começar a codar é começar o trabalho: Todo → In Progress (e READY TO TEST só vale em `started`).
    if (gate === 'READY TO DEV' && carta.estadoGrupo === 'unstarted') {
      await servico.mudarEstado(carta.id, id, 'started', carta.atualizadoEm);
      await anotar(id, { tipo: 'ESTADO', cartaId: carta.id, carta: carta.identificador, grupo: 'started' });
      carta = await reler(carta.id);
      if (!carta) return nota({ motivoOciosa: 'carta sumiu da fila após mudar o estado' });
    }
    const modelos = await servico.modelos(carta.id);
    let perfilComentarioId = modelos.perfil?.comentarioId ?? null;
    if (!perfilComentarioId) {
      const r = await servico.registrarModelos(carta.id, cfg.perfilPadrao, modelos.versaoCarta, randomUUID());
      perfilComentarioId = r.comentarioId;
      await anotar(id, { tipo: 'PERFIL', cartaId: carta.id, carta: carta.identificador, comentarioId: perfilComentarioId });
      carta = await reler(carta.id);
      if (!carta) return nota({ motivoOciosa: 'carta sumiu da fila após registrar o perfil' });
    }
    if (!carta.elegivel) return nota({ motivoOciosa: `${carta.identificador} deixou de ser elegível: ${carta.motivos.join('; ')}` });
    const resultado = await servico.iniciarDespacho({ cartaId: carta.id, comandoId: cfg.comando, versaoCarta: carta.atualizadoEm,
      perfilComentarioId, chaveIdempotencia: randomUUID(), usuarioId: String(local.ligadaPor ?? 'vigilia') });
    await anotar(id, { tipo: 'TENTATIVA', cartaId: carta.id, carta: carta.identificador, tentativaId: resultado.tentativaId,
      resultado: resultado.resultado ?? 'duplicada', gate });
    const historico = await servico.lerHistorico(carta.id);
    const detalhe = historico.find(e => e.tipo === 'RESULTADO_EXECUTOR' && e.tentativaId === resultado.tentativaId) ?? {};
    if (resultado.resultado === 'impedido' && LIMITE_DE_USO.test(`${detalhe.resumo ?? ''} ${(detalhe.evidencia ?? []).join(' ')}`)) {
      const ate = await pausar(id, cfg.pausaPorLimiteMinutos, 'limite de uso do provedor');
      return nota({ ultimaTentativa: resultado, motivoOciosa: `pausada até ${ate}: limite de uso do provedor` });
    }
    if (resultado.resultado === 'concluido') {
      try {
        const atual = await reler(carta.id);
        if (!atual) throw new Error('carta sumiu da fila antes do avanço');
        if (gate === 'READY TO DEV') {
          const evidencias = [`tentativa ${resultado.tentativaId}`, ...(detalhe.evidencia ?? [])].slice(0, 10).map(x => String(x).slice(0, 500));
          const r = await servico.registrarGate(atual.id, { gate: 'READY TO TEST',
            justificativa: `Vigília: tentativa ${resultado.tentativaId.slice(0, 8)} concluída — comando ${cfg.comando} passou e a validação devolveu APROVADO; a carta passa à fase de teste.`,
            evidencias }, atual.atualizadoEm, randomUUID(), 'READY TO DEV');
          await anotar(id, { tipo: 'AVANCO', cartaId: carta.id, carta: carta.identificador, de: 'READY TO DEV', para: 'READY TO TEST', comentarioId: r.comentarioId });
        } else {
          const r = await servico.mudarEstado(atual.id, id, 'completed', atual.atualizadoEm, 'READY TO TEST');
          await anotar(id, { tipo: 'AVANCO', cartaId: carta.id, carta: carta.identificador, de: 'READY TO TEST', para: r.estadoNome });
        }
      } catch (erro) {
        await anotar(id, { tipo: 'ERRO', cartaId: carta.id, carta: carta.identificador, etapa: 'avanco', motivo: erro.message });
        registrarLog(`[vigilia] avanço de ${carta.identificador} falhou: ${erro.message}`);
      }
    } else if (resultado.resultado === 'rejeitado' && tentativasDe(carta) + 1 >= cfg.maxTentativasPorCarta) {
      await anotar(id, { tipo: 'ESGOTADA', cartaId: carta.id, carta: carta.identificador, tentativas: tentativasDe(carta) + 1 });
    }
    return nota({ ultimaTentativa: resultado });
  }

  async function varrer() {
    if (varrendo) return { pulada: true };
    varrendo = true;
    const resultados = [];
    try {
      for (const p of projetos.filter(x => x.plane)) {
        const local = await lerConfig(p.plane);
        if (!local.ligada) continue;
        try { resultados.push(await varrerProjeto(p, local)); }
        catch (erro) {
          memoria.set(p.plane, { ...memoria.get(p.plane), ultimaVarredura: iso(), motivoOciosa: `erro na varredura: ${erro.message}` });
          await anotar(p.plane, { tipo: 'ERRO', etapa: 'varredura', motivo: erro.message }).catch(() => {});
          registrarLog(`[vigilia] varredura de ${p.pasta} falhou: ${erro.message}`);
          resultados.push({ projetoId: p.plane, erro: erro.message });
        }
      }
    } finally { varrendo = false; }
    return resultados;
  }

  function iniciar() {
    if (temporizador) return;
    temporizador = setInterval(() => { varrer().catch(e => registrarLog(`[vigilia] ${e.message}`)); }, intervaloMs);
    temporizador.unref?.();
  }
  function parar() { if (temporizador) clearInterval(temporizador); temporizador = null; }

  return { estadoDaVigilia, validarAlternancia, alternar, varrer, iniciar, parar };
}
