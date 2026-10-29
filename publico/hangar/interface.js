// Popup do C-3PO ancorado na cena, painéis laterais (droids, projetos, Oficina) e os botões do Hangar. Não mexe em dados do servidor.

import {
  H, BAIAS, FABRICAS, PATIO, ARQ, fabrica, setor, nave, droid, acervoItem, naDoca, situacao, centroPeca, vagaPos, pose,
} from './estado.js';
import { $, calmo, esc, pct, plural, nomeCurto } from './util.js';
import { C, moverCamera, projetar } from './cena.js';
import { conteudo, pedidoDeNave } from './conteudo.js';
import { estadoDroid } from './simulacao.js';
import { diarioAdd } from './narrador.js';
import { contextoDoPopup, limparConversa, perguntar } from './conversa.js';
import { esconderNativo, ligarNativo, mostrarNativo } from './nativo.js';

let popFala = '';
let popDig = 0;
const DA_DOCA = ['peca', 'doca', 'item', 'estacao', 'decisao'];

function ancora(a) {
  if (a.tipo === 'oficina') return { x: ARQ.x, y: ARQ.y, z: ARQ.z };
  if (a.tipo === 'acervo') return acervoItem(a.id)?.slot ?? { x: ARQ.x, y: 2, z: ARQ.z };
  if (a.tipo === 'patio') return { x: PATIO.x + PATIO.w / 2, y: 2, z: PATIO.z };
  if (a.tipo === 'berco') { const v = vagaPos(H.naves.length); return { x: v.x + 7, y: 2, z: v.z }; }
  if (a.tipo === 'baia') { const b = BAIAS[a.i]; return { x: b.x, y: 1, z: b.z }; }
  if (a.tipo === 'fabrica') { const f = fabrica(a.id); return { x: f.x, y: 4, z: f.z }; }
  if (a.tipo === 'droid') return droid(a.id)?.pos ?? { x: 0, y: 0, z: 0 };
  const n = nave(a.nave);
  if (!n) return { x: 0, y: 0, z: 0 };
  if (a.tipo === 'vaga') { const p = pose(n); return { x: p.x, y: 1.5 + p.y, z: p.z }; }
  if (a.tipo === 'doca') return { x: n.cx, y: 2, z: n.cz };
  if (a.tipo === 'peca') return n.pecas[a.i] ? centroPeca(n, n.pecas[a.i]) : { x: n.cx, y: 2, z: n.cz };
  if (a.tipo === 'estacao') return { x: n.estacao.x, y: 3.3, z: n.estacao.z };
  if (a.tipo === 'decisao') { const x = n.chao.find((y) => y.id === a.id); return x ? { x: x.x, y: 1, z: x.z } : { x: n.cx, y: 1, z: n.cz }; }
  if (a.tipo === 'item') { const b = n.bancada.find((y) => y.chave === a.chave); return b ? { x: b.x, y: 2, z: b.z } : { x: n.cx, y: 2, z: n.cz }; }
  return { x: 0, y: 0, z: 0 };
}

export function posicionarPopup() {
  const h = $('hg-holo'); const m = $('hg-mira');
  if (!H.popup || !C.pronto) { m.hidden = true; return; }
  const p0 = ancora(H.popup.alvo); const p = projetar(p0.x, p0.y, p0.z);
  m.hidden = !p.ok;
  m.style.transform = `translate(${p.x}px,${p.y}px)`;
  const pw = h.offsetWidth; const ph = h.offsetHeight; const folga = 26;
  let x = p.x < C.W / 2 ? p.x + folga : p.x - folga - pw;
  x = Math.max(12, Math.min(C.W - pw - 12, x));
  const y = Math.max(12, Math.min(C.H - ph - 12, p.y - ph / 2));
  h.style.transform = `translate(${x}px,${y}px)`;
}

function focar(id) {
  if (H.foco !== id) moverCamera(id);
  H.foco = id;
  if (id && nave(id)) H.selecionada = id;
  $('hg-geral').setAttribute('aria-pressed', String(!id));
  $('hg-btn-oficina').setAttribute('aria-pressed', String(id === 'OFICINA'));
  $('hg-btn-patio').setAttribute('aria-pressed', String(id === 'PATIO'));
  montarProjetos();
}

export function clicar(a) {
  if (a.tipo === 'baia') { const b = BAIAS[a.i]; if (b.ocupante) a = { tipo: 'doca', nave: b.ocupante.id }; }
  if (DA_DOCA.includes(a.tipo) && !naDoca(nave(a.nave))) a = { tipo: 'vaga', nave: a.nave };
  if (a.tipo === 'droid') {
    const d = droid(a.id);
    if (d?.passo === 'consultar' || d?.passo === 'consultar_ir') focar('OFICINA');
    else if (d?.nave && naDoca(d.nave)) focar(d.nave.id);
    else if (d?.nave) focar('PATIO');
    else if (d?.s.projeto === 'central') focar('OFICINA');
    else focar('NORTE');
  } else if (a.tipo === 'oficina' || a.tipo === 'acervo') focar('OFICINA');
  else if (a.tipo === 'vaga' || a.tipo === 'patio' || a.tipo === 'berco') focar('PATIO');
  else if (a.tipo === 'fabrica') focar('NORTE');
  else if (a.nave) focar(a.nave);
  abrir(a);
}

export function abrir(a, silencioso = false) {
  if (DA_DOCA.includes(a.tipo) && !naDoca(nave(a.nave))) a = { tipo: 'vaga', nave: a.nave };
  // A reabertura silenciosa só refresca dados; a conversa em curso fica.
  if (!silencioso) { limparConversa(); mostrarNativo(a.tipo === 'vaga' || a.tipo === 'doca' ? nave(a.nave) : null); }
  H.popup = { alvo: a };
  const h = $('hg-holo'); const c = conteudo(a);
  h.style.setProperty('--cor', c.cor);
  $('hg-holo-olho').textContent = c.olho;
  $('hg-holo-titulo').innerHTML = c.titulo;
  $('hg-holo-corpo').innerHTML = c.corpo;
  if (!silencioso || c.fala !== popFala) { popFala = c.fala; popDig = silencioso ? c.fala.length : 0; if (!silencioso) diarioAdd(c.fala); }
  $('hg-holo-fala').textContent = popFala.slice(0, Math.ceil(popDig));
  h.hidden = false; $('hg-narrador').hidden = true;
  atualizarPopup(0);
}

export function fecharPopup() {
  limparConversa();
  esconderNativo();
  H.popup = null; $('hg-holo').hidden = true; $('hg-mira').hidden = true; $('hg-narrador').hidden = false;
}

function atualizarPopup(dt) {
  if (!H.popup) return;
  const h = $('hg-holo'); const a = H.popup.alvo;
  if (popDig < popFala.length) { popDig = calmo ? popFala.length : Math.min(popFala.length, popDig + dt * 55); $('hg-holo-fala').textContent = popFala.slice(0, Math.ceil(popDig)); }
  const u = h.querySelector('[data-uso]');
  if (u) {
    const b = nave(a.nave)?.bancada.find((y) => y.chave === a.chave);
    const s = b ? H.T - b.ativo : null;
    u.textContent = !b ? '—' : s < 0.25 ? 'em uso agora' : b.ativo < 0 ? 'ainda não usado nesta visita' : `há ${Math.round(s)} s`;
  }
  for (const c of h.querySelectorAll('[data-consulta]')) c.textContent = ultimaConsulta(acervoItem(c.dataset.consulta));
  const ed = h.querySelector('[data-estado-droid]');
  if (ed) { const d = droid(ed.dataset.estadoDroid); if (d) { const e = estadoDroid(d); ed.innerHTML = `<span class="hg-chip" style="--c:${e.c}">${esc(e.r)}</span>`; } }
}

const ultimaConsulta = (x) => (x?.consultas.length ? `${x.consultas[0].droid} · há ${Math.max(0, Math.round(H.T - x.consultas[0].T))} s` : '—');

// ---------- Painéis laterais ----------

let chaveDroids = '';
let chaveProjetos = '';

function montarDroids() {
  const chave = H.droids.map((d) => d.id).join();
  if (chave === chaveDroids) return;
  chaveDroids = chave;
  $('hg-droids').innerHTML = H.droids.length ? H.droids.map((d) => `<button type="button" class="hg-droid" data-droid="${esc(d.id)}" style="--cor:${fabrica(d.ia).cor}">
    <span class="hg-droid-topo"><span class="hg-tag">${esc(d.rotulo)}</span><span class="hg-ia">${fabrica(d.ia).nome}</span><span class="hg-chip hg-estado"></span></span>
    <span class="hg-droid-doca"></span><span class="hg-droid-carta"></span><span class="hg-droid-agora"></span></button>`).join('')
    : '<p class="hg-vazio">Nenhuma sessão de IA viva nesta máquina nos últimos 15 minutos.</p>';
}

function montarProjetos() {
  const chave = `${H.naves.map((n) => `${n.id}:${n.estado === 'estacionada' ? 'p' : 'd'}`).join()}|${H.foco}`;
  if (chave === chaveProjetos) return;
  chaveProjetos = chave;
  const botao = (n, estac) => `<button type="button" class="hg-proj hg-preench${estac ? ' estac' : ''}${n.congelado ? ' congelado' : ''}${H.foco === n.id ? ' sel' : ''}" data-proj="${esc(n.id)}" style="--cor:${n.cor}">
    <span class="hg-proj-nome">${esc(n.nome)}</span><span class="hg-proj-pct" data-pct></span>${estac ? '' : '<span class="hg-proj-sinais" data-sinais></span>'}</button>`;
  const ativos = H.naves.filter((n) => n.estado !== 'estacionada'); const parados = H.naves.filter((n) => n.estado === 'estacionada');
  $('hg-projetos').innerHTML = `<h3>Nas docas · ${ativos.length} de ${BAIAS.length}</h3><div class="hg-lista-proj">${ativos.map((n) => botao(n, false)).join('') || '<p class="hg-vazio">Nenhuma.</p>'}</div>
    <h3>No pátio do Plane · ${parados.length}</h3><div class="hg-lista-proj">${parados.map((n) => botao(n, true)).join('')}
    <button type="button" class="hg-proj nova" data-berco>+ encomendar nave nova</button></div>`;
}

export function atualizarPaineis(dt = 0) {
  montarDroids();
  for (const b of $('hg-droids').querySelectorAll('[data-droid]')) {
    const d = droid(b.dataset.droid);
    if (!d) continue;
    const est = estadoDroid(d); const n = d.nave; const carta = n && d.s.cartao && n.cartoes[d.s.cartao];
    const e = b.querySelector('.hg-estado'); e.style.setProperty('--c', est.c); e.textContent = est.r;
    b.querySelector('.hg-droid-doca').textContent = n ? `${n.nome} · ${situacao(n)}` : d.s.projeto === 'central' ? 'trabalho transversal · ~/Work' : 'fora do ~/Work';
    b.querySelector('.hg-droid-carta').innerHTML = carta ? `<b>${esc(carta[1])}</b>${esc(carta[2])}` : '';
    const a = d.s.acoes.at(-1);
    b.querySelector('.hg-droid-agora').textContent = a ? `${a.ferramenta} · ${a.tipo === 'consultar' ? `${a.item} → Oficina` : nomeCurto(a.arquivo ?? a.programa ?? (a.tipo === 'cartao' ? 'cartão' : '—'))}` : '';
  }
  const emCampo = H.droids.filter((d) => !d.encerrar).length;
  $('hg-conta-droids').textContent = `${emCampo} em campo`;
  $('hg-fabricas').innerHTML = FABRICAS.map((f) => {
    const k = H.droids.filter((d) => d.ia === f.id && !d.encerrar).length;
    return `<li style="--cor:${f.cor}"><button type="button" class="hg-link" data-fab="${f.id}"><b>${f.nome}</b></button><span>${f.ativa ? `${k} ${plural(k, 'droid', 'droids')} em campo` : 'offline · sem CLI viva'}</span></li>`;
  }).join('');
  montarProjetos();
  for (const b of $('hg-projetos').querySelectorAll('[data-proj]')) {
    const n = nave(b.dataset.proj);
    if (!n) continue;
    b.style.setProperty('--pct', `${(n.pct * 100).toFixed(1)}%`);
    b.querySelector('[data-pct]').textContent = n.estadoBacklog === 'ok' ? pct(n.pct) : '—';
    const alvo = b.querySelector('[data-sinais]');
    if (alvo) {
      const k = n.chao.length + n.chaoExtra + n.produto.length; const aqui = H.droids.filter((d) => d.nave === n && !d.encerrar).length;
      const s = [`<span class="hg-chip" style="--c:var(--hg-realce)">${esc(situacao(n))}</span>`, `<span class="hg-chip" style="--c:var(--hg-ok)">${aqui} ${plural(aqui, 'droid', 'droids')}</span>`];
      if (k) s.push(`<span class="hg-chip" style="--c:var(--hg-alerta)">${k} ${plural(k, 'decisão', 'decisões')}</span>`);
      if (n.sonda) s.push(`<span class="hg-chip" style="--c:${n.sonda === 'falha' ? 'var(--hg-falha)' : 'var(--hg-ok)'}">sonda ${n.sonda === 'falha' ? 'falhou' : 'ok'}</span>`);
      const html = s.join(''); if (alvo.innerHTML !== html) alvo.innerHTML = html;
    }
  }
  $('hg-conta-proj').textContent = H.erroHangar ? 'Plane fora' : `${H.naves.length} no catálogo`;
  const recentes = H.acervo.filter((x) => x.consultas.length).sort((a, b) => b.consultas[0].T - a.consultas[0].T).slice(0, 5);
  const lista = $('hg-oficina-lista'); const chave = recentes.map((x) => x.id).join();
  if (lista.dataset.chave !== chave || !lista.innerHTML) {
    lista.dataset.chave = chave;
    lista.innerHTML = recentes.length
      ? recentes.map((x) => `<li><button type="button" class="hg-link" style="--cor:${setor(x.setor).cor}" data-acervo="${esc(x.id)}">${esc(x.nome)}</button><span data-consulta="${esc(x.id)}"></span></li>`).join('')
      : '<li><span>Nenhuma consulta desde que o Hangar abriu.</span></li>';
  }
  for (const c of lista.querySelectorAll('[data-consulta]')) c.textContent = ultimaConsulta(acervoItem(c.dataset.consulta));
  atualizarPopup(dt);
}

// ---------- Eventos ----------

export function iniciarInterface() {
  $('hg-holo-fechar').addEventListener('click', fecharPopup);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && H.popup && !$('hg-ajuda').open && !$('aba-hangar').hidden) fecharPopup(); });
  $('hg-droids').addEventListener('click', (e) => { const b = e.target.closest('[data-droid]'); if (b) clicar({ tipo: 'droid', id: b.dataset.droid }); });
  // A fábrica também abre pela lista lateral: o popup mostra a frota em leitura (F2).
  $('hg-fabricas').addEventListener('click', (e) => { const b = e.target.closest('[data-fab]'); if (b) clicar({ tipo: 'fabrica', id: b.dataset.fab }); });
  $('hg-projetos').addEventListener('click', (e) => {
    if (e.target.closest('[data-berco]')) { clicar({ tipo: 'berco' }); return; }
    const b = e.target.closest('[data-proj]'); if (!b) return;
    const n = nave(b.dataset.proj);
    clicar(naDoca(n) ? { tipo: 'doca', nave: n.id } : { tipo: 'vaga', nave: n.id });
  });
  $('hg-oficina-lista').addEventListener('click', (e) => { const b = e.target.closest('[data-acervo]'); if (b) clicar({ tipo: 'acervo', id: b.dataset.acervo }); });
  $('hg-oficina-todos').addEventListener('click', () => clicar({ tipo: 'oficina' }));
  $('hg-geral').addEventListener('click', () => { fecharPopup(); focar(null); });
  $('hg-btn-oficina').addEventListener('click', () => clicar({ tipo: 'oficina' }));
  $('hg-btn-patio').addEventListener('click', () => clicar({ tipo: 'patio' }));
  $('hg-abrir-ajuda').addEventListener('click', () => { try { $('hg-ajuda').showModal(); } catch { $('hg-ajuda').setAttribute('open', ''); } });
  $('hg-fechar-ajuda').addEventListener('click', () => $('hg-ajuda').close());

  ligarNativo();
  $('hg-conversa').addEventListener('submit', (e) => {
    e.preventDefault();
    const campo = $('hg-conversa-pergunta'); const pergunta = campo.value;
    if (!pergunta.trim() || !H.popup) return;
    campo.value = '';
    perguntar(contextoDoPopup(), pergunta);
  });

  const corpo = $('hg-holo-corpo');
  corpo.addEventListener('submit', (e) => {
    if (e.target.id !== 'hg-form-encomenda') return;
    e.preventDefault();
    const f = e.target; const nome = f.nome.value.trim(); const modulosTexto = f.modulos.value;
    const modulos = modulosTexto.split('\n').map((s) => s.trim()).filter(Boolean);
    let sigla = f.sigla.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const erro = !nome ? 'Falta o nome do projeto.' : !modulos.length ? 'Escreva pelo menos um módulo, um por linha.' : '';
    if (erro) { $('hg-enc-erro').textContent = erro; $('hg-enc-erro').hidden = false; return; }
    if (!sigla) sigla = nome.normalize('NFD').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 5) || 'NOVA';
    abrir({ tipo: 'berco', dados: { nome, sigla, modulos }, rascunho: { nome, sigla: f.sigla.value, modulosTexto } });
  });
  corpo.addEventListener('click', async (e) => {
    const acao = e.target.closest('[data-acao]');
    if (acao && H.popup?.alvo.tipo === 'berco') {
      const a = H.popup.alvo;
      if (acao.dataset.acao === 'voltar') { abrir(a.pedido ? { ...a, pedido: false } : { tipo: 'berco', rascunho: a.rascunho }, true); return; }
      if (acao.dataset.acao === 'confirmar') { abrir({ ...a, pedido: true }); return; }
      if (acao.dataset.acao === 'copiar') {
        try { await navigator.clipboard.writeText(pedidoDeNave(a.dados)); $('hg-copiado').hidden = false; } catch {
          const sel = getSelection(); const r = document.createRange(); r.selectNodeContents($('hg-pedido')); sel.removeAllRanges(); sel.addRange(r);
        }
        return;
      }
    }
    const l = e.target.closest('[data-alvo]');
    if (l) clicar(JSON.parse(l.dataset.alvo));
  });
}


