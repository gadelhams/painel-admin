// Retrato só-leitura de um projeto para o zelador: cartas, comentários, atividades e relações pela chave Guest (sem cache, pelo caminho do projeto) e o git. Não escreve nada.
//
// J20/J27: cada GET vai por `/projects/<id>/…`; nada vem do cache de 60 s do Hangar. Leitura
// que falha numa carta deixa só aquela carta intocável (motivo no diário); a lista de cartas
// que falha derruba o job inteiro. B1: o universo das relações é o do juiz real (fila-leitura.js):
// as cartas de TODOS os projetos do catálogo, cada uma com o projeto e a sigla dela. B2: a carta
// com aplicação pendente na mesa é intocável; o diário da mesa ilegível deixa todas intocáveis.
// Para a CLI sai um texto: só as candidatas, com a descrição e os últimos comentários truncados,
// e uma linha por outra carta aberta. A candidata em Backlog leva também as relações e os códigos
// que cita, com o estado de cada um (PAINEL-62, D14): conselho à CLI, não controle. Cada candidata
// leva as linhas suspeitas exatas (prosa com o vocabulário de dependência), que o PRONTA tem de julgar.
import { PROJETOS } from '../projetos.js';
import { todas } from './contrato-local.js';
import { normalizarInteracao } from './interacao-canal.js';
import { digitalDaCarta, ehZelador, motivoIntocavel, nomesDe } from './zelador-politica.js';
import { linhasSuspeitas, resumoDasDependencias } from './zelador-preparo.js';

const ABERTA = c => !['completed', 'cancelled', 'canceled'].includes(c.state?.group);

// Atividades e comentários: o Plane devolve lista simples ou paginada.
export async function listar(consultar, url) {
  const primeira = await consultar(`${url}${url.includes('?') ? '&' : '?'}per_page=100`);
  if (Array.isArray(primeira)) return primeira;
  if (!Array.isArray(primeira?.results)) throw new Error('resposta do Plane fora da forma');
  if (!primeira.next_page_results) return primeira.results;
  return todas(consultar, url);
}

export class RetratoZelador {
  // `cartaReservada(id)` (F4b, item 9): a reserva viva de outra sessão; ilegível = reservada.
  constructor({ consultar, git, estado, projetos = PROJETOS, pendenciasMesa = async () => [], cartaReservada = null }) {
    this.cartaReservada = cartaReservada;
    this.consultar = consultar;
    this.git = git;
    this.estado = estado;
    this.catalogo = new Map(projetos.filter(p => p.plane).map(p => [p.plane, p]));
    this.pendenciasMesa = pendenciasMesa;
  }

  // `cartas` = as do projeto; `porId` = as de todo o catálogo (qualquer falha derruba a leitura).
  async cartasDoProjeto(projeto) {
    const planos = (await todas(this.consultar, '/projects/')).filter(p => this.catalogo.has(p.id));
    if (!planos.some(p => p.id === projeto.plane)) planos.push({ id: projeto.plane, identifier: projeto.sigla });
    const lotes = await Promise.all(planos.map(async p => (await todas(this.consultar, `/projects/${p.id}/work-items/?expand=state,labels`))
      .map(c => ({ ...c, sigla: p.id === projeto.plane ? projeto.sigla : (this.catalogo.get(p.id)?.sigla ?? p.identifier), projetoId: p.id, filhos: [] }))));
    const todasAsCartas = lotes.flat();
    const porId = new Map(todasAsCartas.map(c => [c.id, c]));
    for (const c of todasAsCartas) if (c.parent && porId.has(c.parent)) porId.get(c.parent).filhos.push(c.id);
    return { cartas: todasAsCartas.filter(c => c.projetoId === projeto.plane), porId };
  }

  // Identificadores (SIGLA-N) com aplicação pendente na mesa; null = ilegível.
  async mesaPendente() {
    try { return new Set((await this.pendenciasMesa()).map(p => String(p.identificador ?? '').toUpperCase())); }
    catch { return null; }
  }

  // Os detalhes de uma carta, ao vivo; cada parte ilegível vira null (a política falha fechada).
  async detalhes(projetoId, cartaId) {
    const base = `/projects/${projetoId}/work-items/${cartaId}`;
    const ler = p => p.catch(() => null);
    const [comentarios, atividades, relacoes, lease, historico, reserva] = await Promise.all([
      ler(listar(this.consultar, `${base}/comments/`)), ler(listar(this.consultar, `${base}/activities/`)),
      ler(this.consultar(`${base}/relations/`)), this.estado.lerLease(cartaId).catch(() => ({ ilegivel: true })),
      this.estado.lerHistorico(cartaId).catch(() => null),
      this.cartaReservada ? this.cartaReservada(cartaId).catch(() => ({ motivo: 'reservas ilegíveis' })) : null,
    ]);
    return { comentarios, atividades, relacoes, lease, historico, reserva };
  }

  async montar(projeto, pasta, agoraMs) {
    const [{ cartas, porId }, git, mesa] = await Promise.all([this.cartasDoProjeto(projeto), this.git.retrato(pasta), this.mesaPendente()]);
    const abertas = cartas.filter(ABERTA);
    const identificador = c => `${projeto.sigla}-${c.sequence_id}`;
    const detalhes = new Map();
    for (const c of abertas) detalhes.set(c.id, await this.detalhes(projeto.plane, c.id));
    const candidatas = [];
    const intocaveis = [];
    const digitais = new Map();
    for (const c of abertas) {
      const d = detalhes.get(c.id);
      const motivo = motivoIntocavel(c, { porId, ...d, agoraMs, mesaPendente: mesa && mesa.has(identificador(c).toUpperCase()) });
      if (motivo) { intocaveis.push({ carta: identificador(c), cartaId: c.id, motivo }); continue; }
      candidatas.push(c);
      digitais.set(c.id, digitalDaCarta(c, d.comentarios));
    }
    const porIdentificador = new Map(cartas.map(c => [identificador(c), c]));
    const porCodigo = new Map([...porId.values()].map(c => [`${c.sigla}-${c.sequence_id}`.toUpperCase(), c]));
    const texto = JSON.stringify({
      projeto: { sigla: projeto.sigla, titulo: projeto.titulo, ramoPrincipal: git.principal },
      git: { log: git.log, status: git.status, aFrenteDoRemoto: git.aFrente }, docsCurrent: git.current,
      candidatas: candidatas.map(c => ({ carta: identificador(c), titulo: c.name, estado: c.state?.name ?? '?', etiquetas: nomesDe(c),
        pai: c.parent && porId.has(c.parent) ? identificador(porId.get(c.parent)) : null,
        descricaoHtml: String(c.description_html ?? '').slice(0, 4000),
        linhasSuspeitas: linhasSuspeitas({ carta: c, comentarios: detalhes.get(c.id).comentarios }),
        ...(c.state?.group === 'backlog' ? { conferenciaDeDependencias: resumoDasDependencias(c, detalhes.get(c.id).relacoes, porId, porCodigo) } : {}),
        comentarios: (detalhes.get(c.id).comentarios ?? []).slice(-8).map(x => ({ autor: ehZelador(x) ? 'zelador' : 'outro',
          quando: x.created_at ?? null, texto: normalizarInteracao(x).texto.slice(0, 600) })) })),
      outrasAbertas: abertas.filter(c => !candidatas.includes(c)).map(c => ({ carta: identificador(c), titulo: c.name, estado: c.state?.name ?? '?', etiquetas: nomesDe(c) })),
    });
    return { cartas, porId, abertas, detalhes, candidatas, intocaveis, digitais, porIdentificador, identificador, git, texto };
  }
}
