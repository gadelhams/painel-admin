// Projeção só-leitura do Plane + contratos locais + estado operacional.
// Nenhuma chave de escrita entra neste módulo ou na resposta HTTP.
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { criarClientePlane } from '../plane.js';
import { avaliarCarta, avaliarProntidaoGate, comandoPermitido, validarContrato } from './politica.js';
import { criarEstadoOrquestracao } from './estado.js';
import { lerCanalPlane } from './canal-plane.js';
import { catalogoModelos, PAPEIS, prepararPlanoExecucao, validarSelecoes } from './modelos.js';
import { codificarPerfil, perfisDoCanal } from './perfil-plane.js';
import { codificarHandoff, handoffsDoCanal, validarHandoff as validarEntradaHandoff } from './handoff-plane.js';
import { codificarGate, gatesDoCanal, validarPropostaGate } from './gate-plane.js';

const RAIZ = path.resolve(import.meta.dirname, '../..');

// Recusa ANTES de qualquer escrita (card ou evento *_PENDENTE): a confirmação pode
// descartar o desafio com 422 em vez de retê-lo como 'resultado incerto'.
function recusa(mensagem) {
  const erro = new Error(mensagem);
  erro.semEscrita = true;
  return erro;
}
const REPOSITORIO = path.resolve(import.meta.dirname, '..');
const WEB = 'https://plane.casa.astargne.com/astargne/browse';

async function todas(consultar, url) {
  const itens = [];
  let cursor;
  do {
    const sep = url.includes('?') ? '&' : '?';
    const pagina = await consultar(`${url}${sep}per_page=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (!Array.isArray(pagina.results)) throw new Error('resposta paginada inválida do Plane');
    itens.push(...pagina.results);
    cursor = pagina.next_page_results ? pagina.next_cursor : null;
  } while (cursor);
  return itens;
}

async function contratoDoProjeto(projeto, raiz) {
  if (!projeto || projeto.area !== 'ProjetosPessoais') return { contrato: null, erros: [] };
  const pasta = raiz === RAIZ && projeto.pasta === 'painel-admin'
    ? REPOSITORIO : path.join(raiz, projeto.pasta, projeto.subRepo ?? '');
  const arquivo = path.join(pasta, '.orquestrador.json');
  try {
    const contrato = JSON.parse(await fs.readFile(arquivo, 'utf8'));
    return { contrato, erros: validarContrato(contrato, projeto.plane) };
  } catch (e) {
    if (e.code === 'ENOENT') return { contrato: null, erros: [] };
    return { contrato: {}, erros: ['arquivo local ilegível'] };
  }
}

function textoVisivel(html = '') {
  return (typeof html === 'string' ? html : '').replace(/<\/(?:p|div|li|h[1-6]|br)>|<br\s*\/>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[^\S\n]+/g, ' ');
}

function idRelacionado(relacao) {
  if (typeof relacao === 'string') return relacao;
  for (const chave of ['issue_id', 'work_item_id', 'related_work_item', 'related_issue', 'work_item', 'issue', 'target']) {
    const valor = relacao?.[chave];
    if (typeof valor === 'string') return valor;
    if (typeof valor?.id === 'string') return valor.id;
  }
  return null; // relation.id costuma ser o ID da relação, não da carta.
}

export function dependenciasDaCarta(carta, relacoes, cartasPorId) {
  if (!relacoes || typeof relacoes !== 'object') return [{ id: '?', estado: 'desconhecida', motivo: 'relações do Plane indisponíveis' }];
  if (['blocked_by', 'start_after', 'finish_after'].some(tipo => relacoes[tipo] !== undefined && !Array.isArray(relacoes[tipo]))) {
    return [{ id: '?', estado: 'desconhecida', motivo: 'relações do Plane inválidas' }];
  }
  const ids = [...(relacoes.blocked_by ?? []), ...(relacoes.start_after ?? []), ...(relacoes.finish_after ?? [])];
  const codigosFormais = new Set();
  const dependencias = ids.map(r => {
    const id = idRelacionado(r);
    const alvo = id && cartasPorId.get(id);
    if (!id || !alvo) return { id: id ?? '?', estado: 'desconhecida', motivo: 'carta dependente não encontrada na leitura' };
    const codigo = `${alvo.sigla}-${alvo.sequence_id}`;
    codigosFormais.add(codigo.toUpperCase());
    return { id: codigo, estado: alvo.state?.group === 'completed' ? 'concluida' : 'pendente', motivo: alvo.state?.name ?? 'estado não concluído' };
  });
  const descricao = textoVisivel(carta.description_html);
  // Somente uma declaração isolada no início da linha prova ausência de relações.
  // "homeProxy.js (novo, sem dependências)" é contexto técnico, não protocolo.
  const declarouSemDependencias = /(?:^|\n)[ \t]*(?:[-*•][ \t]*)?(?:sem depend[eê]ncias|depend[eê]ncias[ \t]*:[ \t]*nenhuma)[ \t]*[.!?;:]?[ \t]*$/im.test(descricao);
  // A declaração positiva vale na linha dos dois-pontos E nas linhas seguintes que
  // começam por código ou marcador de lista: o editor do Plane grava `<ul><li>` e
  // só a primeira linha deixava as demais dependências invisíveis. Só prefixos de
  // projetos lidos nesta varredura são códigos auditáveis (`UTF-8` não é carta).
  const siglas = new Set([...cartasPorId.values()].map(c => c.sigla?.toUpperCase()).filter(Boolean));
  const declaracoes = [...descricao.matchAll(/\b(?<!\bsem\s{1,3})(?:depende\s+d[aeo]|depend[eê]ncias)\s*:\s*(?![ \t]*nenhuma\b)([^\n]*(?:\n[ \t]*(?:[-*•][ \t]*)?[A-Za-z][A-Za-z0-9]{1,15}-\d+\b[^\n]*)*)/gi)];
  for (const declaracao of declaracoes) {
    const codigos = [...new Set((declaracao[1].match(/\b[A-Za-z][A-Za-z0-9]{1,15}-\d+\b/g) ?? []).map(x => x.toUpperCase()))]
      .filter(codigo => siglas.has(codigo.split('-')[0]));
    if (!codigos.length) {
      dependencias.push({ id: 'descrição', estado: 'não formalizada', motivo: 'dependência textual sem identificador auditável no Plane' });
    }
    for (const codigo of codigos) if (!codigosFormais.has(codigo)) {
      dependencias.push({ id: codigo, estado: 'não formalizada', motivo: 'dependência citada no texto sem relação formal correspondente no Plane' });
    }
  }
  if (ids.length === 0 && !declaracoes.length && !declarouSemDependencias) {
    dependencias.push({ id: 'declaração', estado: 'não auditada', motivo: 'ausência de dependências não declarada na carta' });
  }
  if (ids.length && declarouSemDependencias) {
    dependencias.push({ id: 'declaração', estado: 'contraditória', motivo: 'texto declara nenhuma dependência, mas há relações formais no Plane' });
  }
  return dependencias;
}

export function criarServicoOrquestracao({ consultar, raiz = RAIZ, estado = criarEstadoOrquestracao({ diretorio: path.join(os.homedir(), '.local', 'state', 'painel-admin', 'orquestracao') }),
  escritorPerfil = null, escritorHandoff = null, escritorGate = null, projetoEscrita = null, autorEscrita = null,
  identidadesEscrita = {}, executor = null, execucaoHabilitada = false, agora = Date.now } = {}) {
  const identidades = new Map(Object.entries(identidadesEscrita));
  // Compatibilidade com os consumidores da API anterior, de projeto único.
  if (projetoEscrita && autorEscrita) {
    if (identidades.has(projetoEscrita)) throw new Error('identidade de escrita duplicada para o projeto');
    identidades.set(projetoEscrita, { escritorPerfil, escritorHandoff, escritorGate, autorEscrita });
  }
  const identidade = projetoId => identidades.get(projetoId) ?? null;
  const podeDespachar = projetoId => {
    const escrita = identidade(projetoId);
    return Boolean(execucaoHabilitada && executor && escrita?.escritorHandoff && escrita?.escritorPerfil && escrita?.autorEscrita);
  };
  function cliente() {
    if (consultar) return consultar;
    const chave = process.env.PLANE_API_KEY?.trim();
    if (!chave) throw new Error('PLANE_API_KEY de leitura ausente');
    return criarClientePlane({ chave });
  }

  async function fila({ preavaliarId = null, preavaliarGate = null, ignorarLeaseId = null, preavaliarSemGate = null } = {}) {
    const consulta = cliente();
    const catalogo = new Map(PROJETOS.filter(p => p.plane).map(p => [p.plane, p]));
    const projetos = (await todas(consulta, '/projects/')).filter(p => catalogo.has(p.id));
    const lotes = await Promise.all(projetos.map(async p => {
      const itens = await todas(consulta, `/projects/${p.id}/work-items/?expand=state,labels`);
      return itens.map(c => ({ ...c, sigla: p.identifier, projetoNome: p.name, projetoId: p.id }));
    }));
    const cartas = lotes.flat();
    const porId = new Map(cartas.map(c => [c.id, c]));
    for (const c of cartas) c.filhos = [];
    for (const c of cartas) if (c.parent && porId.has(c.parent)) porId.get(c.parent).filhos.push(c.id);
    const contratos = new Map(await Promise.all(projetos.map(async p => [p.id, await contratoDoProjeto(catalogo.get(p.id), raiz)])));
    const itens = await Promise.all(cartas.filter(c => !['canceled', 'cancelled'].includes(c.state?.group)).map(async c => {
      const labels = (c.labels ?? []).map(l => l.name);
      const temGate = labels.includes('READY TO DEV') || labels.includes('READY TO TEST');
      let relacoes = {};
      if (temGate || c.id === preavaliarId) {
        try { relacoes = await consulta(`/projects/${c.projetoId}/work-items/${c.id}/relations/`); }
        catch { relacoes = null; }
      }
      const dependencias = (temGate || c.id === preavaliarId) ? dependenciasDaCarta(c, relacoes, porId) : [];
      const { contrato, erros } = contratos.get(c.projetoId) ?? { contrato: null, erros: [] };
      let lease;
      let historico;
      let erroEstado = null;
      try { [lease, historico] = await Promise.all([estado.lerLease(c.id), estado.lerHistorico(c.id)]); }
      catch { lease = null; historico = []; erroEstado = 'lease ou touchpoints'; }
      const avaliacao = avaliarCarta(c, { contrato, errosContrato: erros, dependencias,
        lease: c.id === ignorarLeaseId ? null : lease, historico, erroEstado, agora: agora() });
      let provenienciaGate = null;
      if (avaliacao.gate) {
        const autorId = identidade(c.projetoId)?.autorEscrita;
        if (!autorId) {
          provenienciaGate = 'identidade de escrita não configurada';
        } else {
          try {
            const canal = await lerCanalPlane({ consultar: consulta, projetoId: c.projetoId, cartaId: c.id });
            const comprovado = gatesDoCanal(canal.interacoes, { projetoId: c.projetoId, cartaId: c.id, autorId })
              .some(g => g.gate === avaliacao.gate);
            provenienciaGate = comprovado ? 'verificada' : 'evidência GATE/v1 ausente ou sem autoria autorizada';
          } catch {
            provenienciaGate = 'evidência GATE/v1 indisponível ou ilegível';
          }
        }
        if (provenienciaGate !== 'verificada') {
          avaliacao.motivos.push(`gate sem proveniência verificável: ${provenienciaGate}`);
          avaliacao.elegivel = false;
        }
      }
      const preavaliacao = c.id === preavaliarId ? avaliarCarta({
        ...c,
        labels: [...(c.labels ?? []).filter(l => !['READY TO DEV', 'READY TO TEST'].includes(l.name)), { name: preavaliarGate }],
      }, { contrato, errosContrato: erros, dependencias, lease, historico, erroEstado, agora: agora() }) : null;
      // `preavaliarSemGate`: a vigília troca READY TO DEV por READY TO TEST, então avalia a
      // prontidão do novo gate como se o anterior já não estivesse na carta.
      const preavaliacaoGate = c.id === preavaliarId ? avaliarProntidaoGate(preavaliarSemGate
        ? { ...c, labels: (c.labels ?? []).filter(l => l.name !== preavaliarSemGate) } : c,
        { gate: preavaliarGate, dependencias, lease: c.id === ignorarLeaseId ? null : lease, erroEstado }) : null;
      return {
        id: c.id, identificador: `${c.sigla}-${c.sequence_id}`, titulo: c.name,
        projeto: c.projetoNome, projetoId: c.projetoId, estado: c.state?.name ?? '?', estadoGrupo: c.state?.group ?? null, url: `${WEB}/${c.sigla}-${c.sequence_id}/`,
        atualizadoEm: c.updated_at, labels, dependencias, provenienciaGate, ...avaliacao,
        comandos: avaliacao.elegivel ? contrato.comandos.map(x => x.id) : [],
        ...(preavaliacao ? { preavaliacao: { gate: preavaliarGate, pendencias: preavaliacao.motivos, tecnicamentePronta: preavaliacao.elegivel } } : {}),
        ...(preavaliacaoGate ? { preavaliacaoGate } : {}),
      };
    }));
    itens.sort((a, b) => Number(b.elegivel) - Number(a.elegivel) || a.identificador.localeCompare(b.identificador, 'pt-BR', { numeric: true }));
    const contagens = new Map();
    for (const item of itens) {
      const atual = contagens.get(item.projetoId) ?? { cartas: 0, candidatas: 0, elegiveis: 0 };
      atual.cartas++;
      if (item.labels.includes('READY TO DEV') || item.labels.includes('READY TO TEST')) atual.candidatas++;
      if (item.elegivel) atual.elegiveis++;
      contagens.set(item.projetoId, atual);
    }
    const visiveis = new Set(projetos.map(p => p.id));
    const projetosDaFila = [...catalogo].map(([id, entrada]) => ({
      id, nome: projetos.find(p => p.id === id)?.name ?? entrada.titulo,
      acessivel: visiveis.has(id),
      ...(contagens.get(id) ?? { cartas: 0, candidatas: 0, elegiveis: 0 }),
      impedimento: visiveis.has(id) ? null : 'Sem acesso de leitura ao projeto no Plane para a identidade Guest do Painel',
    }));
    const podeExecutar = [...identidades.keys()].some(podeDespachar);
    return { modo: podeExecutar ? 'despacho-controlado' : 'leitura-e-simulacao',
      execucaoHabilitada: podeExecutar,
      atualizadoEm: new Date().toISOString(), projetos: projetosDaFila, itens };
  }

  async function validarDespacho(cartaId, comandoId, versaoCarta, ignorarLeaseId = null) {
    if (!execucaoHabilitada || !executor) {
      throw new Error('portão de execução desligado');
    }
    const dados = await fila({ ignorarLeaseId });
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!podeDespachar(item.projetoId)) throw new Error('projeto fora do escopo de execução');
    if (!item.elegivel) throw new Error(`carta impedida: ${item.motivos.join('; ')}`);
    if (item.atualizadoEm !== versaoCarta) throw new Error('carta mudou; recarregue antes de despachar');
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato, erros } = await contratoDoProjeto(projeto, raiz);
    if (!contrato || erros.length) throw new Error('contrato local ausente ou inválido');
    const comando = comandoPermitido(contrato, comandoId);
    const perfil = await lerPerfil(item.projetoId, cartaId);
    if (!perfil) throw new Error('perfil de modelos não registrado no card');
    const plano = prepararPlanoExecucao(contrato, perfil.selecoes);
    const pasta = raiz === RAIZ && projeto.pasta === 'painel-admin' ? REPOSITORIO
      : path.join(raiz, projeto.pasta, projeto.subRepo ?? '');
    await executor.validar({ pasta, contrato, comando, plano, carta: item });
    return { carta: item.identificador, cartaId, projetoId: item.projetoId, versaoCarta,
      comandoId, comando, plano, contrato, gate: item.gate, perfilComentarioId: perfil.comentarioId, pasta };
  }

  async function iniciarDespacho({ cartaId, comandoId, versaoCarta, perfilComentarioId,
    chaveIdempotencia, usuarioId }) {
    if (!execucaoHabilitada || !executor || ![...identidades.keys()].some(podeDespachar)) {
      throw new Error('portão de execução desligado');
    }
    const contexto = { comandoId, versaoCarta, perfilComentarioId, usuarioId };
    const anterior = await estado.consultarTentativa(cartaId, chaveIdempotencia);
    if (anterior) {
      if (anterior.modoReal !== true || JSON.stringify(anterior.contexto) !== JSON.stringify(contexto)) {
        throw new Error('chave de idempotência reutilizada com outra execução');
      }
      return { cartaId, duplicada: true, tentativaId: anterior.tentativaId,
        observacao: 'tentativa já registrada; não reexecutada. Confira lease, touchpoints e card.' };
    }
    // Lease deixado por queda anterior é reconciliado aqui (só metadado local; nunca toma
    // lease ativo), senão a fila o mostraria como 'ativo' para sempre.
    await estado.reconciliar(cartaId);
    const primeiro = await validarDespacho(cartaId, comandoId, versaoCarta).catch(e => { throw recusa(e.message); });
    if (primeiro.perfilComentarioId !== perfilComentarioId) throw recusa('perfil mudou; recarregue antes de despachar');
    const reserva = await estado.reservar({ cartaId, agente: primeiro.plano.papeis.codificacao_testes.agenteId,
      chaveIdempotencia, modoReal: true, contexto });
    if (reserva.duplicada) return { carta: primeiro.carta, duplicada: true,
      tentativaId: reserva.tentativa.tentativaId, observacao: 'tentativa já registrada; não reexecutada' };
    const tentativaId = reserva.lease.tentativaId;
    let lancada = false;
    let batimento;
    let falhaBatimento = false;
    try {
      const segunda = await validarDespacho(cartaId, comandoId, versaoCarta, cartaId);
      if (segunda.perfilComentarioId !== perfilComentarioId || JSON.stringify(segunda.plano) !== JSON.stringify(primeiro.plano)) {
        throw new Error('perfil mudou após a reserva');
      }
      await registrarHandoff(cartaId, { papel: 'orquestracao', tentativaId, resultado: 'em_andamento',
        resumo: `Despacho confirmado pelo usuário ${usuarioId} para ${primeiro.carta}.`,
        evidencia: [`Comando ${comandoId} do contrato`, `Perfil ${perfilComentarioId} sem fallback`] },
      versaoCarta, `${chaveIdempotencia.slice(0, 24)}${tentativaId.slice(24)}`);
      await estado.registrarEvento({ tipo: 'EXECUCAO_PREPARADA', cartaId, tentativaId,
        comandoId, perfilComentarioId, usuarioId });
      // Uma renovação que falha (trava ocupada por segundos) não condena a tentativa:
      // a renovação seguinte bem-sucedida prova posse e validade do lease de novo.
      batimento = setInterval(() => { estado.renovar({ cartaId, tentativaId })
        .then(() => { falhaBatimento = false; })
        .catch(() => {
          falhaBatimento = true;
          estado.registrarEvento({ tipo: 'LEASE_RENOVACAO_FALHOU', cartaId, tentativaId }).catch(() => {});
        }); }, 5 * 60_000);
      batimento.unref?.();
      lancada = true;
      const resultado = await executor.executar({ ...segunda, tentativaId });
      if (falhaBatimento) throw new Error('renovação de lease falhou; resultado exige revisão');
      if (!resultado || !['concluido', 'impedido', 'rejeitado'].includes(resultado.resultado) ||
          typeof resultado.resumo !== 'string' || !Array.isArray(resultado.evidencia)) {
        throw new Error('executor não devolveu resultado verificável');
      }
      // O que o executor devolveu fica em disco ANTES de qualquer chamada ao Plane: se o
      // handoff falhar, a revisão humana tem o resultado, não só 'inconclusa'.
      await estado.registrarEvento({ tipo: 'RESULTADO_EXECUTOR', cartaId, tentativaId,
        resultado: resultado.resultado, resumo: resultado.resumo, evidencia: resultado.evidencia });
      const cartaAtual = await cliente()(`/projects/${segunda.projetoId}/work-items/${cartaId}/`);
      await registrarHandoff(cartaId, { papel: 'orquestracao', tentativaId,
        resultado: resultado.resultado, resumo: resultado.resumo, evidencia: resultado.evidencia },
      cartaAtual.updated_at, randomUUID());
      await estado.concluir({ cartaId, tentativaId, resultado: resultado.resultado });
      return { carta: primeiro.carta, tentativaId, resultado: resultado.resultado, duplicada: false };
    } catch (erro) {
      if (!lancada) await estado.concluir({ cartaId, tentativaId, resultado: 'SEM_INICIO' });
      else await estado.registrarEvento({ tipo: 'EXECUCAO_INCONCLUSA', cartaId, tentativaId,
        motivo: 'executor ou handoff de resultado não confirmado; revisar lease e o evento RESULTADO_EXECUTOR, se houver' });
      throw erro;
    } finally { if (batimento) clearInterval(batimento); }
  }

  async function simular(cartaId, comandoId, selecoes = null) {
    const dados = await fila();
    const item = dados.itens.find(x => x.id === cartaId || x.identificador === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!item.elegivel) return { executaria: false, motivos: item.motivos, carta: item.identificador };
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, raiz);
    comandoPermitido(contrato, comandoId);
    const perfil = !selecoes && identidade(item.projetoId)?.autorEscrita ? await lerPerfil(item.projetoId, item.id) : null;
    const escolhas = selecoes ?? perfil?.selecoes;
    if (!escolhas) return { executaria: false, carta: item.identificador, comando: comandoId,
      motivos: ['perfil de modelos por papel não selecionado; execução não pode escolher agente por fallback'],
      observacao: 'simulação sem lease, processo ou escrita no Plane' };
    const plano = prepararPlanoExecucao(contrato, escolhas);
    return { executaria: true, carta: item.identificador, comando: comandoId, plano,
      perfilRegistrado: Boolean(perfil),
      observacao: 'simulação sem lease, processo ou escrita no Plane; escolhas enviadas na requisição são apenas prévia' };
  }

  async function preavaliar(cartaId, gate) {
    if (!/^[0-9a-f-]{36}$/i.test(cartaId ?? '') || !['READY TO DEV', 'READY TO TEST'].includes(gate)) {
      throw new Error('carta ou gate inválido');
    }
    const dados = await fila({ preavaliarId: cartaId, preavaliarGate: gate });
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    const gatesAtuais = item.labels.filter(x => x === 'READY TO DEV' || x === 'READY TO TEST');
    const ajustesDoGate = gatesAtuais.length > 1 ? ['Resolver gates conflitantes; somente um pode permanecer. Registrar a decisão na carta.']
      : gatesAtuais.length === 1 && gatesAtuais[0] !== gate ? [`Revisar evidência e registrar a troca de ${gatesAtuais[0]} para ${gate} no Plane.`]
        : gatesAtuais.length === 0 ? [`Revisar e registrar evidência de prontidão na carta; IA autorizada ou pessoa pode marcar ${gate} no Plane.`] : [];
    if (gatesAtuais.length === 1 && item.provenienciaGate !== 'verificada') {
      ajustesDoGate.push(`Comprovar no card a autoria e a evidência GATE/v1 do gate atual: ${item.provenienciaGate}.`);
    }
    return {
      carta: item.identificador, gateProposto: gate, gatesAtuais,
      ajustesDoGate,
      pendenciasTecnicas: item.preavaliacao.pendencias,
      pendenciasDoGate: item.preavaliacaoGate.motivos,
      gatePodeSerMarcado: item.preavaliacaoGate.pronta && gatesAtuais.length === 0,
      podeRegistrarGate: Boolean(identidade(item.projetoId)?.escritorGate && identidade(item.projetoId)?.autorEscrita),
      versaoCarta: item.atualizadoEm,
      pendencias: [...ajustesDoGate, ...item.preavaliacao.pendencias],
      dependencias: item.dependencias,
      despachoPassaria: item.preavaliacao.tecnicamentePronta &&
        (gatesAtuais.length === 0 || (gatesAtuais.length === 1 && gatesAtuais[0] === gate && item.provenienciaGate === 'verificada')),
      observacao: 'pré-checagem só-leitura; a marcação por IA exige identidade de escrita própria e evidência auditável; a etiqueta não autoriza despacho',
    };
  }

  // Com o projeto informado (e do catálogo), a leitura vai direto ao card: cada clique na
  // conversa deixava de varrer os 13 projetos e as ~430 cartas só para achar o projetoId.
  async function canal(cartaId, projetoId = null) {
    let projetoDaCarta = projetoId && PROJETOS.some(p => p.plane === projetoId) ? projetoId : null;
    if (!projetoDaCarta) {
      const dados = await fila();
      const item = dados.itens.find(x => x.id === cartaId);
      if (!item) throw new Error('carta não encontrada no Plane');
      projetoDaCarta = item.projetoId;
    }
    const dadosCanal = await lerCanalPlane({ consultar: cliente(), projetoId: projetoDaCarta, cartaId });
    const autorId = identidade(projetoDaCarta)?.autorEscrita;
    return { ...dadosCanal, projetoId: projetoDaCarta, handoffs: autorId ? handoffsDoCanal(dadosCanal.interacoes,
      { projetoId: projetoDaCarta, cartaId, autorId }) : [],
    gates: autorId ? gatesDoCanal(dadosCanal.interacoes,
      { projetoId: projetoDaCarta, cartaId, autorId }) : [] };
  }

  async function validarGate(cartaId, proposta, substituir = null) {
    const entrada = validarPropostaGate(proposta);
    if (substituir !== null && (!['READY TO DEV', 'READY TO TEST'].includes(substituir) || substituir === entrada.gate)) throw new Error('troca de gate inválida');
    const dados = await fila({ preavaliarId: cartaId, preavaliarGate: entrada.gate, preavaliarSemGate: substituir, ignorarLeaseId: substituir ? cartaId : null });
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    if (!identidade(item.projetoId)?.escritorGate || !identidade(item.projetoId)?.autorEscrita) {
      throw new Error('identidade de escrita restrita indisponível para este projeto');
    }
    const gatesAtuais = item.preavaliacaoGate.gatesAtuais.filter(g => g !== substituir);
    if (substituir && !item.labels.includes(substituir)) throw new Error(`gate ${substituir} a trocar não está na carta`);
    if (!item.preavaliacaoGate.pronta || gatesAtuais.length) {
      throw new Error(['gate não pode ser aplicado', ...item.preavaliacaoGate.motivos,
        ...(gatesAtuais.length ? ['gate já presente'] : [])].join('; '));
    }
    return { carta: item.identificador, projetoId: item.projetoId, versaoCarta: item.atualizadoEm, substituir,
      proposta: entrada, aviso: 'Confirmar marcará o gate no Plane com evidência; não criará lease nem execução.' };
  }

  async function registrarGate(cartaId, proposta, versaoCarta, chaveIdempotencia, substituir = null) {
    if (!identidades.size) throw recusa('identidade de escrita restrita não configurada');
    // As varreduras completas da fila ficam FORA da trava: ela protege metadado local e a
    // escrita no card, não segundos de I/O no Plane que fariam outra confirmação desistir.
    const dados = await validarGate(cartaId, proposta, substituir).catch(e => { throw recusa(e.message); });
    if (dados.versaoCarta !== versaoCarta) throw recusa('carta mudou; recarregue antes de marcar gate');
    const escrita = identidade(dados.projetoId);
    if (!escrita?.escritorGate || !escrita?.autorEscrita) throw recusa('projeto fora do escopo de escrita');
    const html = codificarGate({ projetoId: dados.projetoId, cartaId, chaveIdempotencia,
      versaoCarta, ...dados.proposta });
    return estado.comTrava(async () => {
      const historico = await estado.lerHistorico(cartaId);
      if (historico.some(e => e.tipo === 'GATE_PENDENTE' && e.chaveIdempotencia === chaveIdempotencia)) {
        const aplicado = historico.find(e => e.tipo === 'GATE_APLICADO' && e.chaveIdempotencia === chaveIdempotencia);
        if (!aplicado) throw recusa('alteração anterior incerta; conferir a etiqueta e o card antes de repetir');
        return { carta: dados.carta, gate: aplicado.gate, aplicado: true, duplicado: true, comentarioId: aplicado.comentarioId };
      }
      const canalAtual = await lerCanalPlane({ consultar: cliente(), projetoId: dados.projetoId, cartaId });
      const repetido = gatesDoCanal(canalAtual.interacoes, { projetoId: dados.projetoId, cartaId, autorId: escrita.autorEscrita })
        .find(g => g.chaveIdempotencia === chaveIdempotencia);
      if (repetido) {
        if (JSON.stringify(validarPropostaGate(repetido)) !== JSON.stringify(validarPropostaGate(proposta))) {
          throw recusa('chave de idempotência usada com outro gate');
        }
        // Recibo no card sem evento local de aplicação: o comentário existe, a etiqueta não
        // é garantida. Só a conferência humana do card desempata.
        throw recusa('recibo GATE/v1 já existe sem registro local de aplicação; conferir a etiqueta no card antes de repetir');
      }
      const cartaAtual = await cliente()(`/projects/${dados.projetoId}/work-items/${cartaId}/`);
      if (cartaAtual.updated_at !== versaoCarta) throw recusa('carta mudou; recarregue antes de marcar gate');
      await estado.registrarEvento({ tipo: 'GATE_PENDENTE', cartaId, chaveIdempotencia, gate: dados.proposta.gate, substituir });
      const resultado = await escrita.escritorGate({ projetoId: dados.projetoId, cartaId, chaveIdempotencia,
        versaoCarta, gate: dados.proposta.gate, html, remover: substituir });
      await estado.registrarEvento({ tipo: 'GATE_APLICADO', cartaId, chaveIdempotencia,
        gate: dados.proposta.gate, comentarioId: resultado.comentarioId });
      return { carta: dados.carta, gate: dados.proposta.gate, aplicado: true, duplicado: false,
        comentarioId: resultado.comentarioId };
    });
  }

  async function validarHandoff(cartaId, entrada) {
    const dados = await fila();
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    const escrita = identidade(item.projetoId);
    if (!escrita?.escritorHandoff || !escrita?.autorEscrita) {
      throw new Error('identidade de escrita restrita indisponível para este projeto');
    }
    const normalizada = validarEntradaHandoff(entrada);
    if (normalizada.tentativaId) {
      const historico = await estado.lerHistorico(cartaId);
      if (!historico.some(e => e.tipo === 'TENTATIVA' && e.tentativaId === normalizada.tentativaId)) {
        throw new Error('tentativa não registrada no estado operacional');
      }
      if (normalizada.papel === 'validador') {
        const dadosCanal = await lerCanalPlane({ consultar: cliente(), projetoId: item.projetoId, cartaId });
        const anteriores = handoffsDoCanal(dadosCanal.interacoes, { projetoId: item.projetoId, cartaId, autorId: escrita.autorEscrita });
        if (!anteriores.some(h => h.papel === 'desenvolvedor' && h.tentativaId === normalizada.tentativaId)) {
          throw new Error('validação exige handoff do desenvolvedor na mesma tentativa');
        }
      }
    }
    return { carta: item.identificador, projetoId: item.projetoId, versaoCarta: item.atualizadoEm,
      entrada: normalizada, aviso: 'Handoff será gravado no card; texto e voz não autorizam execução.' };
  }

  async function registrarHandoff(cartaId, entrada, versaoCarta, chaveIdempotencia) {
    const dados = await validarHandoff(cartaId, entrada).catch(e => { throw recusa(e.message); });
    if (dados.versaoCarta !== versaoCarta) throw recusa('carta mudou; recarregue antes de registrar handoff');
    const escrita = identidade(dados.projetoId);
    const html = codificarHandoff({ projetoId: dados.projetoId, cartaId, chaveIdempotencia,
      versaoCarta, ...dados.entrada });
    return estado.comTrava(async () => {
      const atual = await lerCanalPlane({ consultar: cliente(), projetoId: dados.projetoId, cartaId });
      const anteriores = handoffsDoCanal(atual.interacoes, { projetoId: dados.projetoId, cartaId, autorId: escrita.autorEscrita });
      const repetido = anteriores.find(h => h.chaveIdempotencia === chaveIdempotencia);
      if (repetido) {
        if (JSON.stringify(repetido.entrada ?? { papel: repetido.papel, tentativaId: repetido.tentativaId,
          resultado: repetido.resultado, resumo: repetido.resumo, evidencia: repetido.evidencia }) !== JSON.stringify(dados.entrada)) {
          throw new Error('chave de idempotência usada com outro handoff');
        }
        return { carta: dados.carta, persistido: true, duplicado: true, comentarioId: repetido.comentarioId };
      }
      const historico = await estado.lerHistorico(cartaId);
      if (historico.some(e => e.tipo === 'HANDOFF_PENDENTE' && e.chaveIdempotencia === chaveIdempotencia)) {
        throw recusa('handoff anterior incerto; conferir o card antes de repetir');
      }
      const cartaAtual = await cliente()(`/projects/${dados.projetoId}/work-items/${cartaId}/`);
      if (cartaAtual.updated_at !== versaoCarta) throw recusa('carta mudou; recarregue antes de registrar handoff');
      await estado.registrarEvento({ tipo: 'HANDOFF_PENDENTE', cartaId, chaveIdempotencia,
        papel: dados.entrada.papel, tentativaId: dados.entrada.tentativaId });
      const comentarioId = await escrita.escritorHandoff({ projetoId: dados.projetoId, cartaId, html, chaveIdempotencia });
      await estado.registrarEvento({ tipo: 'HANDOFF_REGISTRADO', cartaId, chaveIdempotencia, comentarioId,
        papel: dados.entrada.papel, tentativaId: dados.entrada.tentativaId });
      return { carta: dados.carta, persistido: true, duplicado: false, comentarioId };
    });
  }

  async function lerPerfil(projetoId, cartaId) {
    const autorId = identidade(projetoId)?.autorEscrita;
    if (!autorId) return null;
    const canal = await lerCanalPlane({ consultar: cliente(), projetoId, cartaId });
    return perfisDoCanal(canal.interacoes, { projetoId, cartaId, autorId })
      .sort((a, b) => String(a.quando ?? '').localeCompare(String(b.quando ?? ''))).at(-1) ?? null;
  }

  async function modelos(cartaId) {
    const dados = await fila();
    const item = dados.itens.find(x => x.id === cartaId);
    if (!item) throw new Error('carta não encontrada no Plane');
    const projeto = PROJETOS.find(p => p.plane === item.projetoId);
    const { contrato, erros } = await contratoDoProjeto(projeto, raiz);
    const perfil = contrato && !erros.length ? await lerPerfil(item.projetoId, item.id) : null;
    if (perfil) validarSelecoes(contrato, perfil.selecoes); // perfil obsoleto ou malformado bloqueia; não há fallback.
    return { carta: item.identificador, projetoId: item.projetoId, versaoCarta: item.atualizadoEm,
      papeis: PAPEIS, opcoes: contrato && !erros.length ? catalogoModelos(contrato) : [],
      perfil, podeRegistrar: Boolean(identidade(item.projetoId)?.escritorPerfil && identidade(item.projetoId)?.autorEscrita),
      impedimentos: erros.length ? erros : contrato ? [] : ['contrato local ausente'] };
  }

  async function validarModelos(cartaId, selecoes) {
    const dados = await modelos(cartaId);
    if (dados.impedimentos.length) throw new Error(dados.impedimentos.join('; '));
    const projeto = PROJETOS.find(p => p.plane === dados.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, raiz);
    const validadas = validarSelecoes(contrato, selecoes);
    let impedimentosExecucao = [];
    try { prepararPlanoExecucao(contrato, validadas); }
    catch (erro) { impedimentosExecucao = [erro.message]; }
    return { carta: dados.carta, selecoes: validadas, impedimentosExecucao,
      persistida: false, observacao: 'proposta validada contra o contrato; nenhuma alteração no Plane ou execução' };
  }

  async function registrarModelos(cartaId, selecoes, versaoCarta, chaveIdempotencia) {
    if (!identidades.size) throw new Error('identidade de escrita restrita não configurada');
    const dados = await modelos(cartaId);
    const escrita = identidade(dados.projetoId);
    if (!escrita?.escritorPerfil || !escrita?.autorEscrita) throw new Error('projeto fora do escopo de escrita');
    if (dados.impedimentos.length) throw new Error(dados.impedimentos.join('; '));
    const projeto = PROJETOS.find(p => p.plane === dados.projetoId);
    const { contrato } = await contratoDoProjeto(projeto, raiz);
    const validadas = validarSelecoes(contrato, selecoes);
    const html = codificarPerfil({ projetoId: dados.projetoId, cartaId, chaveIdempotencia, versaoCarta, selecoes: validadas });
    return estado.comTrava(async () => {
      const canalAtual = await lerCanalPlane({ consultar: cliente(), projetoId: dados.projetoId, cartaId });
      const perfis = perfisDoCanal(canalAtual.interacoes, { projetoId: dados.projetoId, cartaId, autorId: escrita.autorEscrita });
      const repetido = perfis.find(p => p.chaveIdempotencia === chaveIdempotencia);
      if (repetido) {
        if (JSON.stringify(repetido.selecoes) !== JSON.stringify(validadas)) throw recusa('chave de idempotência usada com outro perfil');
        return { carta: dados.carta, persistida: true, duplicada: true, comentarioId: repetido.comentarioId };
      }
      if ((await estado.lerHistorico(cartaId)).some(e => e.tipo === 'PERFIL_PENDENTE' && e.chaveIdempotencia === chaveIdempotencia)) {
        throw recusa('registro anterior incerto; conferir o card antes de repetir');
      }
      const cartaAtual = await cliente()(`/projects/${dados.projetoId}/work-items/${cartaId}/`);
      if (cartaAtual.updated_at !== versaoCarta) throw recusa('carta mudou; recarregue antes de registrar o perfil');
      await estado.registrarEvento({ tipo: 'PERFIL_PENDENTE', cartaId, chaveIdempotencia });
      const comentarioId = await escrita.escritorPerfil({ projetoId: dados.projetoId, cartaId, html, chaveIdempotencia });
      await estado.registrarEvento({ tipo: 'PERFIL_REGISTRADO', cartaId, chaveIdempotencia, comentarioId });
      return { carta: dados.carta, persistida: true, duplicada: false, comentarioId };
    });
  }

  // Vigília: Todo → In Progress ao começar a codar; In Progress → Done quando o teste é
  // aprovado (tirando READY TO TEST). Um evento local antes e um depois, como os outros escritores.
  async function mudarEstado(cartaId, projetoId, grupo, versaoCarta, removerEtiqueta = null) {
    const escrita = identidade(projetoId);
    if (!escrita?.escritorEstado || !escrita?.autorEscrita) throw recusa('identidade de escrita de estado indisponível para este projeto');
    return estado.comTrava(async () => {
      await estado.registrarEvento({ tipo: 'ESTADO_PENDENTE', cartaId, grupo, removerEtiqueta });
      const resultado = await escrita.escritorEstado({ projetoId, cartaId, grupo, versaoCarta, removerEtiqueta });
      await estado.registrarEvento({ tipo: 'ESTADO_ALTERADO', cartaId, grupo, estadoNome: resultado.estadoNome, removerEtiqueta });
      return resultado;
    });
  }

  async function contrato(projetoId) {
    return contratoDoProjeto(PROJETOS.find(p => p.plane === projetoId), raiz);
  }

  return { fila, simular, preavaliar, canal, modelos, validarModelos, registrarModelos,
    validarHandoff, registrarHandoff, validarGate, registrarGate, validarDespacho, iniciarDespacho,
    mudarEstado, contrato, podeDespachar, lerHistorico: cartaId => estado.lerHistorico(cartaId),
    recuperarInterrupcoes: () => estado.recuperarInterrupcoes() };
}
