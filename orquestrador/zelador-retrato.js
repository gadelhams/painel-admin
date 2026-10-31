// Retrato só-leitura de um projeto para o zelador: cartas, comentários, atividades e relações pela chave Guest (sem cache, pelo caminho do projeto) e o git. Não escreve nada.
//
// J20/J27: cada GET vai por `/projects/<id>/…`; nada vem do cache de 60 s do Hangar. Leitura
// que falha numa carta deixa só aquela carta intocável (motivo no diário); a lista de cartas
// que falha derruba o job inteiro. Para a CLI sai um texto: só as candidatas, com a descrição
// e os últimos comentários truncados, e uma linha por outra carta aberta.
import { todas } from './contrato-local.js';
import { normalizarInteracao } from './interacao-canal.js';
import { digitalDaCarta, ehZelador, motivoIntocavel, nomesDe } from './zelador-politica.js';

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
  constructor({ consultar, git, estado }) {
    this.consultar = consultar;
    this.git = git;
    this.estado = estado;
  }

  async cartasDoProjeto(projeto) {
    const cartas = (await todas(this.consultar, `/projects/${projeto.plane}/work-items/?expand=state,labels`))
      .map(c => ({ ...c, sigla: projeto.sigla, filhos: [] }));
    const porId = new Map(cartas.map(c => [c.id, c]));
    for (const c of cartas) if (c.parent && porId.has(c.parent)) porId.get(c.parent).filhos.push(c.id);
    return { cartas, porId };
  }

  // Os detalhes de uma carta, ao vivo; cada parte ilegível vira null (a política falha fechada).
  async detalhes(projetoId, cartaId) {
    const base = `/projects/${projetoId}/work-items/${cartaId}`;
    const ler = p => p.catch(() => null);
    const [comentarios, atividades, relacoes, lease, historico] = await Promise.all([
      ler(listar(this.consultar, `${base}/comments/`)), ler(listar(this.consultar, `${base}/activities/`)),
      ler(this.consultar(`${base}/relations/`)), this.estado.lerLease(cartaId).catch(() => ({ ilegivel: true })),
      this.estado.lerHistorico(cartaId).catch(() => null),
    ]);
    return { comentarios, atividades, relacoes, lease, historico };
  }

  async montar(projeto, pasta, agoraMs) {
    const [{ cartas, porId }, git] = await Promise.all([this.cartasDoProjeto(projeto), this.git.retrato(pasta)]);
    const abertas = cartas.filter(ABERTA);
    const identificador = c => `${projeto.sigla}-${c.sequence_id}`;
    const detalhes = new Map();
    for (const c of abertas) detalhes.set(c.id, await this.detalhes(projeto.plane, c.id));
    const candidatas = [];
    const intocaveis = [];
    const digitais = new Map();
    for (const c of abertas) {
      const d = detalhes.get(c.id);
      const motivo = motivoIntocavel(c, { porId, ...d, agoraMs });
      if (motivo) { intocaveis.push({ carta: identificador(c), cartaId: c.id, motivo }); continue; }
      candidatas.push(c);
      digitais.set(c.id, digitalDaCarta(c, d.comentarios));
    }
    const porIdentificador = new Map(cartas.map(c => [identificador(c), c]));
    const texto = JSON.stringify({
      projeto: { sigla: projeto.sigla, titulo: projeto.titulo, ramoPrincipal: git.principal },
      git: { log: git.log, status: git.status, aFrenteDoRemoto: git.aFrente }, docsCurrent: git.current,
      candidatas: candidatas.map(c => ({ carta: identificador(c), titulo: c.name, estado: c.state?.name ?? '?', etiquetas: nomesDe(c),
        pai: c.parent && porId.has(c.parent) ? identificador(porId.get(c.parent)) : null,
        descricaoHtml: String(c.description_html ?? '').slice(0, 4000),
        comentarios: (detalhes.get(c.id).comentarios ?? []).slice(-8).map(x => ({ autor: ehZelador(x) ? 'zelador' : 'outro',
          quando: x.created_at ?? null, texto: normalizarInteracao(x).texto.slice(0, 600) })) })),
      outrasAbertas: abertas.filter(c => !candidatas.includes(c)).map(c => ({ carta: identificador(c), titulo: c.name, estado: c.state?.name ?? '?', etiquetas: nomesDe(c) })),
    });
    return { cartas, porId, abertas, detalhes, candidatas, intocaveis, digitais, porIdentificador, identificador, git, texto };
  }
}
