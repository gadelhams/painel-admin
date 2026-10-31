// Lista fechada dos efeitos da mesa contra a carta ATUAL: o pedido do dono vira um delta por nome, a impressão digital da carta, o corpo do PATCH e a verificação depois dele. Puro; não lê nem grava.
//
// Efeitos v1 (docs/plano-mesa-de-decisao.md): destravar (tira ASTARGNE ou a legada DONO e
// troca só o marcador "(ASTARGNE…)"/"(DONO…)" da descrição), pôr ou tirar PRODUTO, mudar o
// estado para um dos cinco do projeto. Nada mais: nem READY TO DEV/TEST, nem BLOQUEADA,
// nem texto livre na descrição. O `updated_at` do Plane muda sozinho e com a própria escrita,
// por isso a versão da carta é a digital do conteúdo, não ele.
import { createHash } from 'node:crypto';
import { RecusaMesa } from './permissao.js';
import { FONTE } from './protocolo-decisao.js';
import { esc } from './texto-html.js';

const TRAVAS = ['ASTARGNE', 'DONO'];
const PRODUTO = 'PRODUTO';
const ESTADOS = ['Backlog', 'Todo', 'In Progress', 'Done', 'Cancelled'];
const GATES = ['READY TO DEV', 'READY TO TEST'];
const MARCADOR = /\((?:ASTARGNE|DONO)(?![\p{L}])[^)]{0,200}\)/gu;
// Sem o estado do /g: testar não pode mexer no lastIndex de quem troca.
const temMarcador = t => new RegExp(MARCADOR.source, 'u').test(String(t ?? ''));
const sha = t => createHash('sha256').update(String(t ?? '')).digest('hex');
const idDe = x => (x && typeof x === 'object' ? x.id : x);
const nomes = carta => carta.labels.map(l => l.name);

export function validarPedido(efeitos) {
  if (!efeitos || typeof efeitos !== 'object' || Array.isArray(efeitos) ||
      Object.keys(efeitos).sort().join(',') !== 'destravar,estado,produto') throw new RecusaMesa('efeitos: use exatamente destravar, produto e estado');
  const { destravar, produto, estado } = efeitos;
  if (typeof destravar !== 'boolean') throw new RecusaMesa('efeitos.destravar: verdadeiro ou falso');
  if (!['manter', 'por', 'tirar'].includes(produto)) throw new RecusaMesa('efeitos.produto: manter, por ou tirar');
  if (estado !== null && !ESTADOS.includes(estado)) throw new RecusaMesa(`efeitos.estado: nulo ou um de ${ESTADOS.join(', ')}`);
  return { destravar, produto, estado };
}

// Só entra na mesa carta que espera decisão do dono; bloqueio por outra carta não é decisão.
export const esperaDecisao = carta => nomes(carta).some(n => [...TRAVAS, PRODUTO].includes(n));

const dataCurta = quando => { const d = new Date(quando); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
const textoMarcador = (decisao, quando) =>
  `(decidido em ${dataCurta(quando)}: ${decisao.replace(/[()]/g, '').replace(/\s+/g, ' ').slice(0, 120).trim()})`;

function unica(lista, nome, oQue) {
  const achadas = lista.filter(x => x.name === nome);
  if (achadas.length !== 1) throw new RecusaMesa(`${oQue} ${nome} ${achadas.length ? 'não é única' : 'não existe'} no projeto`);
  return achadas[0];
}

// O delta por NOME (os ids se resolvem de novo a cada leitura). `marcador` só diz se há o que trocar.
export function calcularDelta(r, pedido, { decisao, quando }) {
  const atuais = nomes(r.carta);
  const tirar = [];
  const por = [];
  const linhas = [];
  const avisos = [];
  let marcador = null;
  if (pedido.destravar) {
    const travas = TRAVAS.filter(t => atuais.includes(t));
    if (!travas.length) throw new RecusaMesa('destravar: a carta não tem a label ASTARGNE (nem a legada DONO)');
    tirar.push(...travas);
    linhas.push(...travas.map(t => `tirar a label ${t}`));
    const achados = String(r.carta.description_html ?? '').match(MARCADOR) ?? [];
    if (achados.length) {
      marcador = { antes: achados, depois: textoMarcador(decisao, quando) };
      linhas.push(`trocar na descrição ${achados.join(' e ')} por ${marcador.depois}`);
    } else avisos.push('a descrição não tem o marcador (ASTARGNE…)/(DONO…): só a label sai');
  }
  if (pedido.produto === 'por') {
    if (atuais.includes(PRODUTO)) throw new RecusaMesa('pôr PRODUTO: a carta já tem a label');
    unica(r.labels, PRODUTO, 'a label');
    por.push(PRODUTO); linhas.push('pôr a label PRODUTO');
  } else if (pedido.produto === 'tirar') {
    if (!atuais.includes(PRODUTO)) throw new RecusaMesa('tirar PRODUTO: a carta não tem a label');
    tirar.push(PRODUTO); linhas.push('tirar a label PRODUTO');
  }
  let estado = null;
  if (pedido.estado) {
    unica(r.estados, pedido.estado, 'o estado');
    const de = r.carta.state?.name ?? '?';
    if (de === pedido.estado) throw new RecusaMesa(`estado: a carta já está em ${de}`);
    estado = { de, para: pedido.estado };
    linhas.push(`estado: ${de} → ${pedido.estado}`);
  }
  const depois = atuais.filter(n => !tirar.includes(n)).concat(por);
  if (pedido.destravar && depois.some(n => GATES.includes(n)) && !depois.some(n => [...TRAVAS, 'BLOQUEADA'].includes(n))) {
    avisos.push(`a carta fica despachável: tem ${depois.filter(n => GATES.includes(n)).join(' e ')} e nenhuma trava`);
  }
  if (pedido.destravar && depois.includes(PRODUTO)) avisos.push('PRODUTO continua: a carta segue na estação de planejamento');
  return { tirar, por, estado, marcador: Boolean(marcador), textoMarcador: marcador?.depois ?? null, linhas, avisos };
}

// Mesmo delta? (o que o dono viu no preparar contra a leitura do confirmar)
export const mesmoDelta = (a, b) => JSON.stringify([a.tirar, a.por, a.estado, a.marcador]) === JSON.stringify([b.tirar, b.por, b.estado, b.marcador]);

// Conteúdo que importa à decisão; comentários da própria aplicação (`proprias`) não contam.
export function digital(r, { proprias = [] } = {}) {
  const comentarios = r.comentarios.filter(c => !(c.external_source === FONTE && proprias.includes(c.external_id))).map(c => c.id).sort();
  return sha(JSON.stringify({ estado: idDe(r.carta.state), labels: r.carta.labels.map(l => l.id).sort(), nome: r.carta.name,
    descricao: sha(r.carta.description_html), comentarios }));
}

// Ids por nome, na leitura dada. Label a tirar que já saiu não é erro: o delta é idempotente.
export function resolver(r, delta) {
  return { tirar: r.carta.labels.filter(l => delta.tirar.includes(l.name)).map(l => l.id),
    por: delta.por.map(n => unica(r.labels, n, 'a label').id),
    estado: delta.estado ? unica(r.estados, delta.estado.para, 'o estado').id : null };
}

// O PATCH é a leitura de agora ± o delta, só nos campos que mudam.
export function corpoDoPatch(r, delta, ids) {
  const corpo = {};
  const atuais = r.carta.labels.map(l => l.id);
  const alvo = [...new Set(atuais.filter(id => !ids.tirar.includes(id)).concat(ids.por))];
  if ([...alvo].sort().join() !== [...atuais].sort().join()) corpo.labels = alvo;
  if (ids.estado && idDe(r.carta.state) !== ids.estado) corpo.state = ids.estado;
  const descricao = String(r.carta.description_html ?? '');
  if (delta.marcador && delta.textoMarcador && temMarcador(descricao)) corpo.description_html = descricao.replace(MARCADOR, esc(delta.textoMarcador));
  return { corpo, labelsEsperadas: alvo };
}

// Depois do PATCH: aplicado (tudo vale e nenhuma label fora do delta mudou), não aplicado
// (nada vale) ou divergente (o resto) — qualquer que tenha sido a resposta do PATCH.
export function verificar(depois, delta, labelsEsperadas) {
  const atuais = nomes(depois.carta);
  const checagens = [
    ...delta.tirar.map(n => ({ ok: !atuais.includes(n), texto: `label ${n} fora` })),
    ...delta.por.map(n => ({ ok: atuais.includes(n), texto: `label ${n} posta` })),
    ...(delta.estado ? [{ ok: depois.carta.state?.name === delta.estado.para, texto: `estado ${delta.estado.para}` }] : []),
    ...(delta.marcador ? [{ ok: !temMarcador(depois.carta.description_html), texto: 'marcador trocado' }] : []),
  ];
  const conjuntoIgual = depois.carta.labels.map(l => l.id).sort().join() === [...labelsEsperadas].sort().join();
  const valem = checagens.filter(c => c.ok);
  const resultado = !checagens.length ? (conjuntoIgual ? 'só registro' : 'divergente')
    : valem.length === checagens.length && conjuntoIgual ? 'aplicado'
      : !valem.length ? 'não aplicado' : 'divergente';
  const notas = conjuntoIgual ? [] : ['as labels da carta não são as esperadas: outra label mudou junto (conferir no Plane)'];
  return { resultado, mudancas: valem.map(c => c.texto), faltam: checagens.filter(c => !c.ok).map(c => c.texto), notas };
}
