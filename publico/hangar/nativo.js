// Interruptor "Steam livre" no popup da nave que tem jogo nativo. Marcar ou desmarcar só prepara;
// a gravação é a segunda ação, com a sessão do Cadastro Único, como a vigília.
//
// O bloco é marcação fixa acima de #hg-holo-corpo, que conteudo.js remonta como HTML a cada
// abertura (e que no CKBL rola por 17 módulos): aqui só muda o estado, e os ouvintes são ligados uma vez.

import { $ } from './util.js';

const ROTA = '/api/orquestracao/nativo';
let atual = null; // { nave, linha } da nave aberta
let geracao = 0;

async function json(url, opcoes) {
  const r = await fetch(url, { cache: 'no-store', ...opcoes });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(corpo.erro || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return corpo;
}

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

function restante(iso) {
  const min = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60_000));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`;
}

function desenhar(linha, mensagem) {
  const caixa = $('hg-nativo-caixa');
  caixa.checked = Boolean(linha?.liberada);
  caixa.indeterminate = false;
  caixa.disabled = !linha;
  $('hg-nativo-horas').disabled = !linha || linha.liberada;
  $('hg-nativo-confirma').hidden = true;
  $('hg-nativo-estado').textContent = mensagem ?? (!linha ? 'Liberação indisponível.'
    : linha.liberada ? `Liberado até ${hora(linha.ate)} (faltam ${restante(linha.ate)}). Depois disso, desliga sozinho.`
      : 'Desligado: ninguém abre o jogo neste PC.');
}

export async function mostrarNativo(n) {
  const minha = ++geracao;
  const bloco = $('hg-nativo');
  if (!n?.jogoNativo || !n.planePrj) { atual = null; bloco.hidden = true; return; }
  atual = { nave: n, linha: null };
  bloco.hidden = false;
  $('hg-nativo-jogo').textContent = n.jogoNativo;
  desenhar(null, 'Lendo a liberação…');
  try {
    const estado = await json(ROTA);
    if (minha !== geracao) return;
    const select = $('hg-nativo-horas');
    if (!select.options.length) for (const h of estado.horas) select.add(new Option(`por ${h} h`, String(h), h === 4, h === 4));
    atual.linha = estado.projetos.find((p) => p.projeto === n.planePrj) ?? null;
    desenhar(atual.linha, estado.legivel ? undefined : estado.observacao);
  } catch (erro) {
    if (minha === geracao) desenhar(null, `Não consegui ler a liberação: ${erro.message}`);
  }
}

export function esconderNativo() { geracao++; atual = null; $('hg-nativo').hidden = true; }

async function preparar(horas) {
  const minha = geracao;
  const caixa = $('hg-nativo-caixa');
  caixa.indeterminate = true;
  caixa.disabled = true;
  $('hg-nativo-estado').textContent = 'Verificando sua sessão…';
  try {
    const dados = await json(`${ROTA}/preparar`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projeto: atual.nave.planePrj, horas }) });
    if (minha !== geracao) return;
    if (dados.jaEstava) { desenhar(atual.linha, 'Já estava desligado.'); return; }
    $('hg-nativo-aviso').textContent = dados.aviso;
    const botao = $('hg-nativo-confirmar');
    botao.textContent = dados.ligar ? `Confirmar: liberar até ${hora(dados.ate)}` : 'Confirmar: desligar agora';
    botao.dataset.id = dados.confirmacaoId;
    botao.disabled = false;
    $('hg-nativo-confirma').hidden = false;
    $('hg-nativo-estado').textContent = `Confira e confirme até ${hora(dados.expiraEm)}.`;
  } catch (erro) {
    if (minha !== geracao) return;
    desenhar(atual.linha, erro.status === 401 ? `${erro.message} Entre em https://astargne.com/login e volte a esta aba.` : erro.message);
  }
}

async function confirmar() {
  const minha = geracao;
  const botao = $('hg-nativo-confirmar');
  botao.disabled = true;
  $('hg-nativo-estado').textContent = 'Gravando…';
  try {
    const r = await json(`${ROTA}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmacaoId: botao.dataset.id }) });
    if (minha !== geracao) return;
    atual.linha = r;
    desenhar(r);
  } catch (erro) {
    if (minha === geracao) desenhar(atual.linha, erro.message);
  }
}

export function ligarNativo() {
  $('hg-nativo-caixa').addEventListener('change', (e) => {
    if (!atual?.linha) return;
    preparar(e.target.checked ? Number($('hg-nativo-horas').value) : 0);
  });
  $('hg-nativo-confirmar').addEventListener('click', confirmar);
  $('hg-nativo-cancelar').addEventListener('click', () => { geracao++; if (atual) desenhar(atual.linha); });
}
