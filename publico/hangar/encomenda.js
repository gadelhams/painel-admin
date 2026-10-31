// Berço de encomendas: monta o popup, lê as pendentes (GET aberto) e registra o pedido por SSO + duas ações (preparar mostra o resumo, confirmar grava). Não cria projeto nem fala com o Plane.
//
// Quem atende é o orquestrador (docs/operacao.md § Encomendas de nave): até a nave entrar no
// catálogo, a vaga do berço mostra "pedida em <data>, aguardando o orquestrador". Todo texto
// que o dono digitou volta do servidor e passa por esc() antes de virar HTML.

import { H } from './estado.js';
import { $, esc } from './util.js';
import { formaDe } from './formas.js';

const ROTA = '/api/hangar/encomendas';
const OLHO = 'C-3PO · berço de encomendas';
const COR = '#f4b446';
let pendentes = [];
let legivel = true;

async function json(url, opcoes) {
  const r = await fetch(url, { cache: 'no-store', ...opcoes });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(corpo.erro || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return corpo;
}

const post = (rota, corpo) => json(`${ROTA}/${rota}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) });
const dia = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const chip = (texto) => `<span class="hg-chip" style="--c:${COR}">${texto}</span>`;
const siglaDe = (s) => (s ? `sigla ${esc(s)}` : 'sigla a definir pelo orquestrador');

export const encomendasPendentes = () => pendentes;
export const situacaoEncomenda = (e) => `pedida em ${dia(e.quando)}, aguardando o orquestrador`;

export async function carregarEncomendas() {
  // Resposta sem a forma esperada vale como falha de leitura: a lista lateral não pode quebrar por ela.
  try { const r = await json(ROTA); if (Array.isArray(r.pendentes)) { pendentes = r.pendentes; legivel = r.legivel !== false; } }
  catch { /* sem leitura, a lista fica como estava; o próximo ciclo tenta de novo */ }
}

function listaPendentes() {
  if (!legivel) return '<p class="hg-erro">O diário de encomendas está ilegível; o orquestrador precisa corrigi-lo antes de outro pedido.</p>';
  if (!pendentes.length) return '';
  return `<h4>Pedidas, aguardando o orquestrador</h4><ul class="hg-linhas" id="hg-enc-pendentes">${pendentes.map((e) =>
    `<li>${chip('pedida')}<span><b>${esc(e.nome)}</b> · ${siglaDe(e.sigla)} · ${esc(situacaoEncomenda(e))}</span></li>`).join('')}</ul>`;
}

const modulosEmPecas = (ms) => `<ul class="hg-linhas">${ms.map((m, i) => `<li>${chip(formaDe(i).nome)}${esc(m)}</li>`).join('')}</ul>`;

export function conteudoBerco(a) {
  const v = H.naves.length + 1;
  if (a.registrada) {
    const e = a.registrada;
    return {
      cor: COR, olho: OLHO, titulo: `${esc(e.nome)}<small>${siglaDe(e.sigla)} · vaga ${v} do pátio</small>`,
      fala: `Pedido registrado, mestre. O orquestrador cria a ${e.nome} no Plane com os módulos; quando o Plane responder, a quilha aparece sozinha nesta vaga.`,
      corpo: `<p class="hg-vazio" id="hg-enc-registrada">${esc(situacaoEncomenda(e))}</p>${modulosEmPecas(e.modulos)}
        <div class="hg-botoes"><button type="button" class="hg-voltar" data-acao="voltar">Voltar ao berço</button></div>`,
    };
  }
  if (a.resumo) {
    const d = a.resumo;
    return {
      cor: COR, olho: OLHO, titulo: `${esc(d.nome)}<small>${siglaDe(d.sigla)} · vaga ${v} do pátio</small>`,
      fala: `Confira, mestre: a ${d.nome} nasce com ${d.modulos.length === 1 ? 'uma peça' : `${d.modulos.length} peças`} em planta. Confirmar registra o pedido para o orquestrador.`,
      corpo: `<h4>Cada módulo vira uma peça</h4>${modulosEmPecas(d.modulos)}
        <p class="hg-vazio" id="hg-enc-aviso">${esc(d.aviso)}</p>
        <p class="hg-erro" id="hg-enc-erro" hidden></p>
        <div class="hg-botoes"><button type="button" class="hg-decidir" data-acao="confirmar">Confirmar encomenda</button><button type="button" class="hg-voltar" data-acao="voltar">Voltar</button></div>`,
    };
  }
  const r = a.rascunho ?? {};
  return {
    cor: COR, olho: OLHO, titulo: `Nova nave<small>vaga ${v} do pátio do Plane</small>`,
    fala: 'Quer encomendar uma nave nova, mestre? Diga o nome e os módulos planejados. Cada módulo vira uma peça, e a nave fica no pátio até um droid começar a trabalhar nela.',
    corpo: `${listaPendentes()}<form class="hg-encomenda" id="hg-form-encomenda" novalidate>
        <label for="hg-enc-nome">Nome do projeto</label>
        <input id="hg-enc-nome" name="nome" maxlength="60" autocomplete="off" placeholder="ex.: Bot de Receitas" value="${esc(r.nome ?? '')}">
        <label for="hg-enc-sigla">Sigla no Plane <span>(opcional; o orquestrador escolhe se faltar)</span></label>
        <input id="hg-enc-sigla" name="sigla" maxlength="6" autocomplete="off" placeholder="ex.: RECEI" value="${esc(r.sigla ?? '')}">
        <label for="hg-enc-mod">Módulos planejados <span>(um por linha, até 20)</span></label>
        <textarea id="hg-enc-mod" name="modulos" rows="4" placeholder="Coleta&#10;Busca&#10;Interface">${esc(r.modulosTexto ?? '')}</textarea>
        <p class="hg-erro" id="hg-enc-erro" hidden></p>
        <button type="submit" class="hg-decidir">Revisar encomenda</button>
      </form>`,
  };
}

function mostrarErro(erro) {
  const p = $('hg-enc-erro');
  if (!p) return;
  p.textContent = erro.status === 401 ? `${erro.message} Entre em https://astargne.com/login e volte a esta aba.` : erro.message;
  p.hidden = false;
}

const noBerco = () => H.popup?.alvo.tipo === 'berco';

// Os ouvintes ficam no corpo do popup (remontado a cada abertura); `abrir` vem da interface, para não haver import circular.
export function ligarEncomenda(corpo, abrir) {
  corpo.addEventListener('submit', async (e) => {
    if (e.target.id !== 'hg-form-encomenda') return;
    e.preventDefault();
    const f = e.target; const nome = f.nome.value.trim(); const modulosTexto = f.modulos.value;
    const modulos = modulosTexto.split('\n').map((s) => s.trim()).filter(Boolean);
    const sigla = f.sigla.value.trim().toUpperCase().replace(/[^A-Z]/g, '') || null;
    const falta = !nome ? 'Falta o nome do projeto.' : !modulos.length ? 'Escreva pelo menos um módulo, um por linha.' : '';
    if (falta) { mostrarErro(new Error(falta)); return; }
    const rascunho = { nome, sigla: f.sigla.value, modulosTexto };
    const botao = f.querySelector('button[type=submit]'); botao.disabled = true; botao.textContent = 'Verificando sua sessão…';
    try {
      const resumo = await post('preparar', { nome, sigla, modulos });
      if (noBerco()) abrir({ tipo: 'berco', resumo, rascunho }, true);
    } catch (erro) {
      if (!noBerco()) return;
      mostrarErro(erro); botao.disabled = false; botao.textContent = 'Revisar encomenda';
    }
  });
  corpo.addEventListener('click', async (e) => {
    const acao = e.target.closest('[data-acao]');
    if (!acao || !noBerco()) return;
    const a = H.popup.alvo;
    if (acao.dataset.acao === 'voltar') { abrir({ tipo: 'berco', rascunho: a.registrada ? undefined : a.rascunho }, true); return; }
    if (acao.dataset.acao !== 'confirmar' || !a.resumo) return;
    acao.disabled = true; acao.textContent = 'Gravando…';
    try {
      const registrada = await post('confirmar', { confirmacaoId: a.resumo.confirmacaoId });
      await carregarEncomendas();
      if (H.popup?.alvo === a) abrir({ tipo: 'berco', registrada });
    } catch (erro) {
      if (H.popup?.alvo !== a) return;
      mostrarErro(erro); acao.disabled = false; acao.textContent = 'Confirmar encomenda';
    }
  });
}
