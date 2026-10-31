// Texto dos comentários da mesa no Plane — DECISAO/v1 (a decisão do dono) e DECISAO-APLICACAO/v1 (o recibo) — e a leitura deles. Não lê nem grava o Plane.
//
// Formato (docs/arquitetura.md § decisao/): o primeiro parágrafo é o cabeçalho fixo, e
// cada campo é um parágrafo "Campo: valor" com o valor escapado. Um zelador que lê a
// carta conta um DECISAO/v1 como recibo do dono só se, além do cabeçalho, o comentário
// tem `external_source: painel-decisao-v1`, ator = o Painel Admin configurado e nunca foi
// editado. A prosa do dono não pode trazer o prefixo de nenhum outro protocolo do canal.
import { filtrarSegredo } from '../acoes/filtro-segredo.js';
import { RecusaMesa } from './permissao.js';
import { esc, textoDeHtml } from './texto-html.js';

export const FONTE = 'painel-decisao-v1';
export const CABECALHO = 'DECISAO/v1';
export const CABECALHO_RECIBO = 'DECISAO-APLICACAO/v1';
const AUTOR_TEXTO = 'Astargne via painel';
const ASSINATURA = 'Painel Admin (C-3PO)';
const P_CABECALHO = `<p><strong>${CABECALHO}</strong> · ${ASSINATURA} · decisão do dono</p>`;
const P_RECIBO = `<p><strong>${CABECALHO_RECIBO}</strong> · ${ASSINATURA} · recibo da aplicação</p>`;
// Prefixos dos outros protocolos que circulam nos comentários (orquestrador, zelador,
// compactação, perfil, a própria mesa): a prosa que os trouxesse viraria outro recibo.
const RESERVADOS = ['GATE/', 'HANDOFF/', 'ZELADOR/', '[ORQ/', 'DECISAO/', 'DECISAO-APLICACAO/', 'COMPACTADO/', 'PERFIL-IA/', 'TENTATIVA/'];
const INVISIVEIS = /[­᠎​-‏‪-‮⁠-⁩﻿]/g;
const CONTROLE = /[\u0000-\u0009\u000B-\u001F\u007F]/;
const LIMITES = { decisao: 300, motivo: 2_000 };


const temReservado = t => { const m = String(t ?? '').normalize('NFKC').replace(INVISIVEIS, '').toUpperCase(); return RESERVADOS.some(r => m.includes(r)); };
const recusaReservado = campo => new RecusaMesa(`${campo}: não pode citar o prefixo de um protocolo do canal (${RESERVADOS.join(', ')})`);

// `ambiente`: o do processo, só para comparar valores de variáveis com nome de segredo — nunca ecoa.
function limpar(campo, valor, { max, min = 0, linhas = false, ambiente }) {
  if (typeof valor !== 'string') throw new RecusaMesa(`${campo}: texto obrigatório`);
  const t = valor.normalize('NFKC').replace(INVISIVEIS, '').replace(/\r\n?/g, '\n').trim();
  if (t.length < min || t.length > max) throw new RecusaMesa(`${campo}: de ${min} a ${max} caracteres`);
  if (CONTROLE.test(t) || (!linhas && t.includes('\n'))) throw new RecusaMesa(`${campo}: ${linhas ? 'caractere de controle' : 'uma linha só'}`);
  if (temReservado(t)) throw recusaReservado(campo);
  // A recusa nunca ecoa o trecho: o texto inteiro volta para o dono, que sabe o que colou.
  if (filtrarSegredo(t, ambiente) !== t) throw new RecusaMesa(`${campo}: o texto parece conter um segredo (chave, token ou senha); tire-o antes de gravar`);
  return t;
}

export function validarProsa({ decisao, motivo }, { ambiente = process.env } = {}) {
  return { decisao: limpar('decisão', decisao, { min: 3, max: LIMITES.decisao, ambiente }),
    motivo: limpar('motivo', motivo ?? '', { max: LIMITES.motivo, linhas: true, ambiente }) };
}

// Tudo o que vai ao comentário passa pela mesma régua, inclusive o que veio da carta (o
// marcador da descrição na linha de Efeitos): só o cabeçalho fixo pode citar DECISAO/.
// O escritor confere de novo no ponto de escrita, com o HTML que vai sair.
export function conferirComentarioMesa(html) {
  const cabecalho = [P_CABECALHO, P_RECIBO].find(c => String(html ?? '').startsWith(c));
  if (!cabecalho) throw new RecusaMesa('comentário fora do formato da mesa');
  if (temReservado(textoDeHtml(html.slice(cabecalho.length), 20_000))) throw recusaReservado('comentário');
  return html;
}

const paragrafo = (campo, valor) => `<p>${campo}: ${esc(valor).replace(/\n/g, '<br>')}</p>`;

export function codificarDecisao({ identificador, decisao, motivo, efeitos, quando }) {
  return conferirComentarioMesa([P_CABECALHO, paragrafo('Carta', identificador), paragrafo('Decisão', decisao),
    paragrafo('Motivo', motivo || '—'), paragrafo('Efeitos', efeitos.length ? efeitos.join('; ') : 'nenhum (só o registro)'),
    paragrafo('Data', new Date(quando).toISOString()), paragrafo('Autor', AUTOR_TEXTO)].join(''));
}

export function codificarRecibo({ identificador, resultado, mudancas, notas, quando }) {
  return [P_RECIBO, paragrafo('Carta', identificador), paragrafo('Resultado', resultado),
    paragrafo('Mudanças verificadas', mudancas.length ? mudancas.join('; ') : 'nenhuma'),
    paragrafo('Notas', notas.length ? notas.join('; ') : '—'), paragrafo('Data', new Date(quando).toISOString())].join('');
}

const campos = (html, inicio) => {
  const c = {};
  for (const [, nome, valor] of html.slice(inicio.length).matchAll(/<p>([^<:]{1,40}): ([\s\S]*?)<\/p>/g)) c[nome] = textoDeHtml(valor, 4_000);
  return c;
};
const separar = t => (!t || t === '—' || t === 'nenhuma' ? [] : t.split('; '));

// O recibo que já está na carta (409 do external_id): ele manda no resultado da retomada.
export function lerRecibo(html) {
  const h = String(html ?? '');
  if (!h.startsWith(P_RECIBO)) return null;
  const c = campos(h, P_RECIBO);
  return c.Resultado ? { resultado: c.Resultado, mudancas: separar(c['Mudanças verificadas']), notas: separar(c.Notas) } : null;
}

const idDe = x => (x && typeof x === 'object' ? x.id : x);

// Só é DECISAO/v1 o comentário da mesa, do ator configurado, nunca editado, com o cabeçalho
// exato. Qualquer outro (inclusive um humano que copiou o texto) devolve null.
export function lerDecisao(comentario, { autorEsperado }) {
  const html = String(comentario?.comment_html ?? '');
  if (!autorEsperado || comentario?.external_source !== FONTE || idDe(comentario.actor ?? comentario.created_by) !== autorEsperado ||
      comentario.edited_at || !html.startsWith(P_CABECALHO)) return null;
  const c = campos(html, P_CABECALHO);
  if (!c.Carta || !c.Decisão || c.Autor !== AUTOR_TEXTO) return null;
  return { carta: c.Carta, decisao: c.Decisão, motivo: c.Motivo === '—' ? '' : c.Motivo,
    efeitos: c.Efeitos ?? '', data: c.Data ?? null, chave: comentario.external_id ?? null };
}
