// O que o C-3PO diz e mostra no popup de cada estrutura do Hangar. Só monta HTML (com escape); não abre nem posiciona o popup.

import {
  H, BAIAS, SETORES, COR_TIPO, NOME_TIPO,
  fabrica, setor, nave, droid, acervoItem, naDoca, travada, pecaAlvo, situacao,
} from './estado.js';
import { esc, pct, plural, nomeCurto, haQuanto } from './util.js';
import { estadoDroid } from './simulacao.js';
import { formaDe } from './formas.js';

// O dono pediu (28/10/2026) as duas categorias de decisão, e que o C-3PO explique a diferença ao abrir cada uma.
const DIF_CHAO = 'Esta é uma decisão que trava módulo: sem ela, a peça não entra na nave. Decisões de produto são outra coisa: ficam na estação de planejamento e mudam o rumo do projeto inteiro, não de uma peça só.';
const DIF_PRODUTO = 'Decisões de produto decidem o rumo do projeto inteiro e ficam aqui, na estação de planejamento; no Plane, levam a label PRODUTO. As que travam um módulo específico ficam no chão da doca, como peças esperando para entrar na nave.';

export const medidor = (rotulo, p, fino) => `<div class="hg-medidor hg-preench${fino ? ' fino' : ''}" style="--pct:${(p * 100).toFixed(1)}%"><span>${esc(rotulo)}</span><b data-p>${pct(p)}</b></div>`;
export const linkAlvo = (a, texto) => `<button type="button" class="hg-link" data-alvo="${esc(JSON.stringify(a))}">${texto}</button>`;
const linkFora = (url, texto) => (url ? `<a class="hg-link" href="${esc(url)}" target="_blank" rel="noopener">${texto}</a>` : '');
export const tagDroid = (d) => `<span class="hg-tag" style="--cor:${fabrica(d.ia).cor}">${esc(d.rotulo)}</span>`;
const chip = (cor, texto) => `<span class="hg-chip" style="--c:${cor}">${texto}</span>`;
const blocoCartas = (n) => `<div class="hg-cartas"><div style="--c:#ac9b81"><b>${n.cartas.aberto}</b><span>em aberto</span></div><div style="--c:var(--hg-alerta)"><b>${n.cartas.andamento}</b><span>em andamento</span></div><div style="--c:var(--hg-ok)"><b>${n.cartas.feito}</b><span>feitas</span></div></div>`;
const vazio = (t) => `<p class="hg-vazio">${t}</p>`;

function blocoDecisao(x, produto) {
  return `<div class="hg-decisao"><span class="hg-sobre">${produto ? 'decisão de produto · estação de planejamento' : `trava o módulo ${esc(x.modulo)} · peça no chão`}</span>
    <p>${x.id ? `<b class="hg-mono">${esc(x.id)}</b> ` : ''}${esc(x.titulo)}</p>
    ${x.detalhe ? `<p class="hg-detalhe">${esc(x.detalhe)}</p>` : ''}
    <span class="hg-linha-chips">${x.tags.map((t) => chip('var(--hg-alerta)', esc(t))).join('')}${linkFora(x.url, 'abrir no Plane')}</span></div>`;
}

const cartaoDe = (n, uuid) => (n && uuid && n.cartoes[uuid]) || null;

function alvoDaAcao(a, n) {
  const pre = a.projeto ? `${esc(a.projeto)}/` : '';
  if (a.tipo === 'consultar') return esc(a.item);
  if (a.tipo === 'cartao') { const c = cartaoDe(n, a.itemPlane); return c ? esc(c[1]) : 'cartão'; }
  if (a.arquivo) return pre + esc(a.arquivo);
  // Arquivo fora do ~/Work (memória, /tmp): o coletor não manda o caminho, só o fato.
  return a.programa ? esc(a.programa) : (a.tipo === 'ler' || a.tipo === 'editar' ? 'fora do ~/Work' : '—');
}
const VERBO = { ler: 'leu', editar: 'editou', testar: 'testou', comando: 'rodou', consultar: 'consultou', cartao: 'cartão' };

export function oQueFaz(d) {
  const a = d.acao;
  if (!d.passo || !a) return estadoDroid(d).r;
  if (a.tipo === 'consultar') return `consultando ${a.item} na Oficina`;
  if (a.tipo === 'editar') return `editando ${nomeCurto(a.arquivo)}`;
  if (a.tipo === 'testar' || a.tipo === 'comando') return `rodando ${a.programa ?? 'um comando'}`;
  if (a.tipo === 'cartao') return `lendo o cartão ${cartaoDe(d.nave, a.itemPlane)?.[1] ?? ''}`.trim();
  return a.arquivo ? `lendo ${nomeCurto(a.arquivo)}` : estadoDroid(d).r;
}

const ondeDroid = (d) => (d.nave ? d.nave.nome : d.s.projeto === 'central' ? 'trabalho transversal' : 'fora do ~/Work');
const linkNave = (n) => linkAlvo(naDoca(n) ? { tipo: 'doca', nave: n.id } : { tipo: 'vaga', nave: n.id }, esc(n.nome));
const caminhoAcervo = (x) => (x.nome.startsWith('~') ? x.nome
  : x.setor === 'skills' ? `skill ${x.nome}` : x.setor === 'licoes' ? `~/Work/ProjetosPessoais/licoes-vivas/${x.nome}` : `~/Work/${x.nome}`);

const linksProjeto = (n) => `<p class="hg-vazio"><a class="hg-link" href="#/projeto/${esc(encodeURIComponent(n.id))}">abrir no painel</a>${n.url ? ` · ${linkFora(n.url, 'abrir no Plane')}` : ''}</p>`;

export function pedidoDeNave(d) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  return [
    `Pedido de nave nova (Hangar do painel-admin, ${hoje}):`,
    `- Projeto: ${d.nome} (sigla ${d.sigla})`,
    `- Módulos no Plane, nesta ordem: ${d.modulos.map((m, i) => `${i + 1}) ${m}`).join('; ')}`,
    'Criar o projeto no Plane com esses módulos (MCP plane), pôr os agentes como Member e o painel como Guest,',
    'e registrar o id em painel-admin/projetos.js junto com ProjetosPessoais/CLAUDE.md e PORTAS.md (PADROES-BACKLOG.md).',
  ].join('\n');
}

export function conteudo(a) {
  if (a.tipo === 'droid') {
    const d = droid(a.id);
    if (!d) return { cor: '#ac9b81', olho: 'C-3PO · droids', titulo: 'Droid<small>já desmontado</small>', fala: 'Este droid já voltou à fábrica, mestre. A sessão dele acabou.', corpo: '' };
    const f = fabrica(d.ia); const n = d.nave; const carta = cartaoDe(n, d.s.cartao);
    const acoes = [...d.s.acoes].reverse().slice(0, 8);
    const idas = d.s.acoes.filter((x) => x.tipo === 'consultar');
    return {
      cor: f.cor, olho: `C-3PO · droid ${f.nome}`, titulo: `Droid ${esc(d.rotulo)}<small>${esc(ondeDroid(d))}</small>`,
      fala: d.encerrar ? `O ${d.rotulo} encerrou a sessão e está voltando à fábrica do ${f.nome}.`
        : `${d.s.estado === 'aguardando' && !d.passo
          ? `O ${d.rotulo} terminou o turno e espera a sua resposta na conversa do ${f.nome} (terminal ou editor), mestre. Enquanto você não escrever, ele não faz nada.`
          : `O ${d.rotulo} está ${oQueFaz(d)}, mestre.`}${carta ? ` O último cartão que tocou foi ${carta[1]}: ${carta[2]}.` : ' Não sei em qual cartão do Plane: a sessão ainda não tocou nenhum pelo MCP.'}`,
      corpo: `<dl class="hg-campos"><dt>IA</dt><dd>${f.nome}</dd><dt>Estado</dt><dd data-estado-droid="${esc(d.id)}"></dd>
        <dt>Projeto</dt><dd>${n ? linkNave(n) : esc(ondeDroid(d))}</dd>
        <dt>Cartão</dt><dd>${carta ? `${esc(carta[1])} · ${esc(carta[2])}` : '—'}</dd>
        <dt>Sessão</dt><dd class="hg-mono">${esc(d.id.slice(0, 8))}</dd></dl>
        <h4>Últimas ações · só ferramenta e arquivo</h4>
        ${acoes.length ? `<ul class="hg-linhas">${acoes.map((x) => `<li>${chip(COR_TIPO[x.tipo] ?? '#ac9b81', VERBO[x.tipo] ?? esc(x.tipo))}<span class="hg-mono">${alvoDaAcao(x, n)}</span><span class="hg-apagado hg-mono">${haQuanto(Date.now() - Date.parse(x.em))}</span></li>`).join('')}</ul>` : vazio('Nenhuma nos últimos 15 minutos.')}
        <h4>Idas à Oficina</h4>
        ${idas.length ? `<ul class="hg-linhas">${idas.slice(-4).reverse().map((x) => { const it = acervoItem(`${x.setor}:${x.item}`); return `<li>${chip(setor(x.setor).cor, setor(x.setor).nome)}${it ? linkAlvo({ tipo: 'acervo', id: it.id }, esc(x.item)) : esc(x.item)}</li>`; }).join('')}</ul>` : vazio('Nenhuma nesta janela.')}`,
    };
  }
  if (a.tipo === 'fabrica') {
    const f = fabrica(a.id); const ds = H.droids.filter((d) => d.ia === f.id);
    return {
      cor: f.cor, olho: 'C-3PO · fábricas, ao norte', titulo: `Fábrica ${f.nome}<small>${f.ativa ? `${ds.length} ${plural(ds.length, 'droid', 'droids')} em campo` : 'offline'}</small>`,
      fala: f.ativa ? `A fábrica do ${f.nome} monta um droid para cada sessão viva nesta máquina e o desmonta quando a sessão acaba.` : `A fábrica do ${f.nome} está fechada: não encontrei a CLI dele rodando nesta máquina.`,
      corpo: ds.length ? `<ul class="hg-linhas">${ds.map((d) => `<li>${tagDroid(d)} ${linkAlvo({ tipo: 'droid', id: d.id }, esc(oQueFaz(d)))}</li>`).join('')}</ul>` : vazio('Nenhum droid.'),
    };
  }
  if (a.tipo === 'baia') {
    const b = BAIAS[a.i];
    return { cor: '#ac9b81', olho: 'C-3PO · docas', titulo: `Doca ${b.i + 1}<small>livre</small>`, fala: 'Esta doca está livre, mestre. A próxima nave em que um droid começar a trabalhar vem para cá.', corpo: '' };
  }
  if (a.tipo === 'patio') {
    const docadas = H.naves.filter((n) => n.estado !== 'estacionada'); const est = H.naves.filter((n) => n.estado === 'estacionada');
    const linha = (n) => `<li>${linkAlvo({ tipo: 'vaga', nave: n.id }, esc(n.nome))} <span class="hg-mono hg-apagado">${pct(n.pct)} · ${situacao(n)}</span></li>`;
    return {
      cor: '#e3a86b', olho: 'C-3PO · pátio do Plane, a oeste', titulo: `Pátio do Plane<small>${H.naves.length} projetos do catálogo, um por vaga</small>`,
      fala: `Todas as naves moram aqui, mestre, com a pilha de cartões de cada uma. ${docadas.length} ${plural(docadas.length, 'está', 'estão')} nas docas agora; as outras ${est.length} esperam um droid.${H.erroHangar ? ' O Plane não respondeu na última leitura.' : ''}`,
      corpo: `<h4>Nas docas</h4><ul class="hg-linhas">${docadas.map(linha).join('') || '<li class="hg-vazio">Nenhuma.</li>'}</ul><h4>Estacionadas</h4><ul class="hg-linhas">${est.map(linha).join('')}</ul>`,
    };
  }
  if (a.tipo === 'berco') return conteudoBerco(a);
  if (a.tipo === 'oficina') {
    const recentes = H.acervo.reduce((s, x) => s + x.consultas.filter((c) => H.T - c.T < 300).length, 0);
    return {
      cor: '#c9a9e8', olho: 'C-3PO · oficina central, a leste', titulo: 'Oficina central<small>definições compartilhadas por todos os projetos</small>',
      fala: `Aqui ficam ${H.acervo.length} definições que valem para todos os projetos: padrões, orientações, skills e lições vivas. ${recentes ? `Nos últimos cinco minutos, ${recentes === 1 ? 'uma consulta' : `${recentes} consultas`}.` : 'Nenhum droid passou aqui nos últimos minutos.'}`,
      corpo: SETORES.map((s) => `<h4 style="color:${s.cor}">${s.nome}</h4><ul class="hg-linhas">${H.acervo.filter((x) => x.setor === s.id).map((x) => `<li>${linkAlvo({ tipo: 'acervo', id: x.id }, esc(x.nome))} <span class="hg-mono hg-apagado" data-consulta="${esc(x.id)}"></span></li>`).join('')}</ul>`).join(''),
    };
  }
  if (a.tipo === 'acervo') {
    const x = acervoItem(a.id); const s = setor(x.setor);
    const projetos = [...new Set(x.consultas.map((c) => c.nave).filter(Boolean))];
    return {
      cor: s.cor, olho: `C-3PO · ${s.nome.toLowerCase()}`, titulo: `${esc(x.nome)}<small>${s.nome}</small>`,
      fala: x.consultas.length ? `${x.nome} foi consultado ${x.consultas.length === 1 ? 'uma vez' : `${x.consultas.length} vezes`} desde que abri o Hangar, mestre. Vale para todos os projetos.` : `${x.nome} ainda não foi consultado desde que abri o Hangar. Está aqui para todos os projetos.`,
      corpo: `<dl class="hg-campos"><dt>Setor</dt><dd>${s.nome}</dd><dt>Onde</dt><dd class="hg-mono">${esc(caminhoAcervo(x))}</dd><dt>Projetos</dt><dd>${projetos.length ? projetos.map(esc).join(', ') : '—'}</dd></dl>
        <h4>Consultas recentes</h4>
        ${x.consultas.length ? `<ul class="hg-linhas">${x.consultas.map((c) => `<li><span class="hg-tag" style="--cor:${fabrica(c.ia).cor}">${esc(c.droid)}</span> ${esc(c.nave ?? 'transversal')} <span class="hg-mono hg-apagado">há ${Math.round(H.T - c.T)} s</span></li>`).join('')}</ul>` : vazio('Nenhuma ainda.')}`,
    };
  }
  const n = nave(a.nave);
  if (!n) return { cor: '#ac9b81', olho: 'C-3PO', titulo: 'Sumiu<small>não está mais no catálogo</small>', fala: 'Esta nave não está mais no catálogo, mestre.', corpo: '' };
  if (a.tipo === 'vaga') {
    const semPlane = n.estadoBacklog !== 'ok';
    return {
      cor: n.cor, olho: 'C-3PO · pátio do Plane', titulo: `${esc(n.nome)}<small>${situacao(n)}${n.producao ? ' · em produção' : ''}${n.sigla ? ` · ${esc(n.sigla)}` : ''}</small>`,
      fala: semPlane ? `A ${n.nome} não tem backlog que eu consiga ler (${n.estadoBacklog === 'sem_backlog' ? 'sem projeto no Plane' : 'o Plane não respondeu'}), mestre. Por isso a nave é só o contorno do casco.`
        : n.congelado ? `A ${n.nome} está congelada, mestre. Só leitura; nenhum droid deve tocar nela.`
          : naDoca(n) ? `A ${n.nome} está na doca ${n.baia.i + 1} agora. A vaga dela no pátio guarda a pilha de cartões.`
            : `A ${n.nome} está estacionada. ${n.cartas.aberto} ${plural(n.cartas.aberto, 'cartão espera', 'cartões esperam')} em aberto. Quando um droid começar a trabalhar nela, eu mando rebocar a nave para uma doca livre.`,
      corpo: `${medidor('cartas concluídas', n.pct)}${blocoCartas(n)}
        <h4>Módulos · ${n.pecas.length}</h4>${n.pecas.map((pc) => medidor(`${pc.F.nome} · ${pc.modulo}`, pc.p, true)).join('') || vazio('Nenhum módulo no Plane.')}
        ${linksProjeto(n)}${naDoca(n) ? `<p class="hg-vazio">${linkAlvo({ tipo: 'doca', nave: n.id }, 'ir para a doca')}</p>` : ''}`,
    };
  }
  if (a.tipo === 'doca') {
    const aqui = H.droids.filter((d) => d.nave === n && !d.encerrar);
    const trav = n.pecas.map((pc, i) => ({ pc, i })).filter((o) => travada(n, o.pc));
    const prox = pecaAlvo(n);
    const fala = `Doca ${n.baia.i + 1}: ${n.nome}, ${pct(n.pct)} das cartas concluídas.`
      + (aqui.length ? ` ${aqui.length === 1 ? 'Um droid' : `${aqui.length} droids`} em serviço.` : ' Nenhum droid aqui agora; logo ela volta ao pátio.')
      + (trav.length ? ` Travado por decisão sua: ${trav.slice(0, 3).map((o) => o.pc.modulo).join(', ')}${trav.length > 3 ? ` e mais ${trav.length - 3}` : ''}.` : ' Nada travado.')
      + (n.sonda === 'falha' ? ' E a sonda de produção está falhando!' : '')
      + (prox ? ` Próxima peça na fila: ${prox.F.nome}, módulo ${prox.modulo}.` : '');
    return {
      cor: n.cor, olho: 'C-3PO · resumo da doca', titulo: `${esc(n.nome)}<small>doca ${n.baia.i + 1} · ${n.producao ? 'em produção' : 'uso local'}${n.sonda ? ` · sonda ${n.sonda === 'falha' ? 'falhando' : 'ok'}` : ''}</small>`, fala,
      corpo: `${medidor('cartas concluídas', n.pct)}${blocoCartas(n)}
        <h4>Em serviço</h4>
        ${aqui.length ? `<ul class="hg-linhas">${aqui.map((d) => `<li>${tagDroid(d)} ${linkAlvo({ tipo: 'droid', id: d.id }, esc(oQueFaz(d)))}${cartaoDe(n, d.s.cartao) ? ` <span class="hg-mono">· ${esc(cartaoDe(n, d.s.cartao)[1])}</span>` : ''}</li>`).join('')}</ul>` : vazio('Nenhum droid na doca.')}
        <h4>Travado · peças no chão</h4>
        ${trav.length ? `<ul class="hg-linhas">${trav.map((o) => `<li>${linkAlvo({ tipo: 'peca', nave: n.id, i: o.i }, `${esc(o.pc.F.nome)} · ${esc(o.pc.modulo)}`)} <span class="hg-mono hg-apagado">${o.pc.decisoes.length} ${plural(o.pc.decisoes.length, 'decisão', 'decisões')}</span></li>`).join('')}</ul>` : vazio('Nada travado.')}
        <h4>Planejamento</h4>
        <p class="hg-vazio">${linkAlvo({ tipo: 'estacao', nave: n.id }, `${n.produto.length} ${plural(n.produto.length, 'decisão de produto', 'decisões de produto')} na estação`)}</p>${linksProjeto(n)}`,
    };
  }
  if (a.tipo === 'peca') {
    const pc = n.pecas[a.i];
    return {
      cor: n.cor, olho: `C-3PO · peça da ${esc(n.nome)}`, titulo: `${esc(pc.modulo)}<small>${pc.F.nome} · ${pc.feitas} de ${pc.total} ${plural(pc.total, 'carta', 'cartas')}</small>`,
      fala: `${pc.F.nome} da ${n.nome}, módulo ${pc.modulo}.${travada(n, pc) ? ' Está travado por uma decisão sua, mestre.' : pc.p >= 1 ? ' Montado por inteiro.' : ''} ${pc.proximas.length ? 'Estas são as próximas fases.' : 'Não há fase aberta.'}`,
      corpo: `${medidor('cartas do módulo concluídas', pc.p)}
        <h4>Próximas fases</h4>
        ${pc.proximas.length ? `<ol class="hg-fases">${pc.proximas.map((p) => `<li>${p.id ? `<b class="hg-mono">${esc(p.id)}</b> ` : ''}${esc(p.titulo)} ${linkFora(p.url, '↗')}</li>`).join('')}</ol>` : vazio('Nenhuma carta aberta neste módulo.')}
        ${pc.decisoes.length ? `<h4>Travado por</h4>${pc.decisoes.map((x) => blocoDecisao(x, false)).join('')}` : ''}`,
    };
  }
  if (a.tipo === 'estacao') {
    const k = n.produto.length;
    return {
      cor: '#f4b446', olho: 'C-3PO · estação de planejamento', titulo: `Planejamento<small>${esc(n.nome)}</small>`,
      fala: `${k ? `${k === 1 ? 'Uma decisão de produto espera' : `${k} decisões de produto esperam`} por você, mestre.` : 'Nenhuma decisão de produto pendente. Que raridade.'} ${DIF_PRODUTO}`,
      corpo: (k ? n.produto.map((x) => blocoDecisao(x, true)).join('') : vazio('Nada para decidir aqui. Para marcar uma decisão como de produto, ponha a label PRODUTO na carta do Plane.'))
        + (n.chao.length ? `<h4>No chão da doca</h4><p class="hg-vazio">${n.chao.length + n.chaoExtra} ${plural(n.chao.length + n.chaoExtra, 'módulo travado', 'módulos travados')} por decisão; clique nas peças no chão.</p>` : ''),
    };
  }
  if (a.tipo === 'decisao') {
    const x = n.chao.find((y) => y.id === a.id);
    if (!x) return conteudo({ tipo: 'doca', nave: n.id });
    return {
      cor: '#ffcc4d', olho: 'C-3PO · peça no chão', titulo: `Decisão<small>trava ${esc(x.modulo)} · ${esc(n.nome)}</small>`,
      fala: `Esta peça está no chão porque espera ${x.decisoes.length === 1 ? 'uma decisão sua' : `${x.decisoes.length} decisões suas`}, mestre. Sem ${plural(x.decisoes.length, 'ela', 'elas')}, o módulo ${x.modulo} não entra na nave. ${DIF_CHAO}`,
      corpo: x.decisoes.map((y) => blocoDecisao(y, false)).join(''),
    };
  }
  if (a.tipo === 'item') {
    const b = n.bancada.find((y) => y.chave === a.chave);
    if (!b) return conteudo({ tipo: 'doca', nave: n.id });
    const c = cartaoDe(n, b.carta); const pc = c ? n.pecas[c[0]] : null;
    const com = H.droids.filter((d) => d.nave === n && b.carta && d.s.cartao === b.carta);
    if (b.tipo === 'cartao') {
      const usos = n.bancada.filter((o) => o.tipo !== 'cartao' && o.carta === b.carta);
      return {
        cor: COR_TIPO.cartao, olho: 'C-3PO · caixa de ferramentas', titulo: `${esc(c?.[1] ?? 'Cartão')}<small>${esc(c?.[2] ?? 'fora do backlog lido')}</small>`,
        fala: `Este é o cartão ${c?.[1] ?? ''}${pc ? `, do módulo ${pc.modulo}` : ''}. ${com.length ? `${com.map((d) => d.rotulo).join(' e ')} ${plural(com.length, 'está', 'estão')} trabalhando nele agora.` : 'Ninguém está nele neste momento.'}`,
        corpo: `<dl class="hg-campos"><dt>Módulo</dt><dd>${pc ? linkAlvo({ tipo: 'peca', nave: n.id, i: c[0] }, `${esc(pc.modulo)} · ${pc.F.nome}`) : '—'}</dd><dt>Droids</dt><dd>${com.length ? com.map(tagDroid).join(' ') : '—'}</dd><dt>Uso</dt><dd data-uso></dd></dl>
          <h4>Bancadas deste cartão</h4>
          ${usos.length ? `<ul class="hg-linhas">${usos.map((o) => `<li>${chip(COR_TIPO[o.tipo], NOME_TIPO[o.tipo])}${linkAlvo({ tipo: 'item', nave: n.id, chave: o.chave }, esc(o.arquivo ?? o.programa))}</li>`).join('')}</ul>` : vazio('Nada ainda.')}
          ${pc ? medidor(`módulo ${pc.modulo}`, pc.p) : ''}`,
      };
    }
    return {
      cor: COR_TIPO[b.tipo], olho: `C-3PO · ${NOME_TIPO[b.tipo]}`, titulo: `${esc(b.rotulo)}<small>${b.tipo === 'editar' ? esc(b.arquivo) : 'programa'}</small>`,
      fala: b.tipo === 'editar' ? `Aqui o droid prensa peças do arquivo ${b.rotulo}${pc ? ` e as instala no módulo ${pc.modulo}` : ''}.` : `Banco de provas: ${b.rotulo}. Cada rodada passa um feixe de varredura sobre a nave. Do comando, só mostro o programa.`,
      corpo: `<dl class="hg-campos"><dt>Cartão</dt><dd>${c ? linkAlvo({ tipo: 'item', nave: n.id, chave: `carta:${b.carta}` }, `${esc(c[1])} · ${esc(c[2])}`) : '—'}</dd><dt>Uso</dt><dd data-uso></dd></dl>`,
    };
  }
  return { cor: '#ac9b81', olho: 'C-3PO', titulo: '—', fala: '', corpo: '' };
}

function conteudoBerco(a) {
  const v = H.naves.length + 1;
  if (a.pedido) {
    return {
      cor: '#f4b446', olho: 'C-3PO · berço de encomendas', titulo: `Pedido pronto<small>${esc(a.dados.nome)} · vaga ${v}</small>`,
      fala: 'Criar projeto no Plane é ação privilegiada, mestre, e o painel só lê. Copie o pedido e entregue ao orquestrador. Quando o Plane responder, a quilha aparece sozinha nesta vaga.',
      corpo: `<pre class="hg-pedido" id="hg-pedido">${esc(pedidoDeNave(a.dados))}</pre>
        <div class="hg-botoes"><button type="button" class="hg-decidir" data-acao="copiar">Copiar pedido</button><button type="button" class="hg-voltar" data-acao="voltar">Voltar</button></div>
        <p class="hg-vazio" id="hg-copiado" hidden>Copiado.</p>`,
    };
  }
  if (a.dados) {
    const d = a.dados;
    return {
      cor: '#f4b446', olho: 'C-3PO · berço de encomendas', titulo: `${esc(d.nome)}<small>sigla ${esc(d.sigla)} · vaga ${v} do pátio</small>`,
      fala: `Confira, mestre: a ${d.nome} nasce com ${d.modulos.length === 1 ? 'uma peça' : `${d.modulos.length} peças`} em planta e nenhuma carta concluída. Confirma?`,
      corpo: `<h4>Cada módulo vira uma peça</h4>
        <ul class="hg-linhas">${d.modulos.map((m, i) => `<li>${chip('#f4b446', formaDe(i).nome)}${esc(m)}</li>`).join('')}</ul>
        <div class="hg-botoes"><button type="button" class="hg-decidir" data-acao="confirmar">Confirmar encomenda</button><button type="button" class="hg-voltar" data-acao="voltar">Voltar</button></div>`,
    };
  }
  const r = a.rascunho ?? {};
  return {
    cor: '#f4b446', olho: 'C-3PO · berço de encomendas', titulo: `Nova nave<small>vaga ${v} do pátio do Plane</small>`,
    fala: 'Quer encomendar uma nave nova, mestre? Diga o nome e os módulos planejados. Cada módulo vira uma peça, e a nave fica no pátio até um droid começar a trabalhar nela.',
    corpo: `<form class="hg-encomenda" id="hg-form-encomenda" novalidate>
        <label for="hg-enc-nome">Nome do projeto</label>
        <input id="hg-enc-nome" name="nome" maxlength="40" autocomplete="off" placeholder="ex.: Bot de Receitas" value="${esc(r.nome ?? '')}">
        <label for="hg-enc-sigla">Sigla no Plane <span>(opcional; gero do nome)</span></label>
        <input id="hg-enc-sigla" name="sigla" maxlength="6" autocomplete="off" placeholder="ex.: RECEI" value="${esc(r.sigla ?? '')}">
        <label for="hg-enc-mod">Módulos planejados <span>(um por linha)</span></label>
        <textarea id="hg-enc-mod" name="modulos" rows="4" placeholder="Coleta&#10;Busca&#10;Interface">${esc(r.modulosTexto ?? '')}</textarea>
        <p class="hg-erro" id="hg-enc-erro" hidden></p>
        <button type="submit" class="hg-decidir">Revisar encomenda</button>
      </form>`,
  };
}

