// Botão play no popup da nave: liga ou desliga a frota naquele projeto (zelador e vigília). Marcar ou desmarcar só prepara; gravar é a segunda ação, com a sessão do Cadastro Único, como o "Steam livre".
//
// Mostra também o que o último job do zelador deixou: feita, o que espera a frota e, quando só
// sobra o dono, o bloqueio em destaque com as cartas que o seguram. A marcação é fixa acima de
// #hg-holo-corpo (conteudo.js remonta o corpo a cada abertura); os ouvintes são ligados uma vez.

import { $, esc } from './util.js';
import { H } from './estado.js';

const ROTA = '/api/orquestracao/play';
const SITUACAO = { ligado: 'Ligado: o zelador limpa as cartas deste projeto e a vigília despacha as elegíveis.',
  desligado: 'Desligado: nenhum droid da frota mexe neste projeto.', suspenso: 'Suspenso por divergência' };
let atual = null; // { nave, linha }
let geracao = 0;

async function json(url, opcoes) {
  const r = await fetch(url, { cache: 'no-store', ...opcoes });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(corpo.erro || `HTTP ${r.status}`); e.status = r.status; throw e; }
  return corpo;
}

const hora = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const lista = (rotulo, itens) => (itens?.length ? `<li><b>${esc(rotulo)}</b> ${itens.map(esc).join(', ')}</li>` : '');

// O fim do último job do zelador neste projeto (GET /api/orquestracao/zelador).
function blocoBloqueio(fim) {
  if (!fim) return '<p class="hg-vazio">O zelador ainda não passou por esta nave.</p>';
  const c = fim.categorias ?? {};
  const topo = fim.feita ? '<p>Feita: nenhuma carta aberta.</p>'
    : fim.soDono ? '<p class="hg-bloqueio-dono"><b>Bloqueada: só decisões e tarefas do dono seguram esta nave.</b></p>'
      : `<p>${fim.abertas} abertas, ${fim.emAndamento} em andamento.</p>`;
  return `${topo}<ul class="hg-linhas">${lista('Decisão:', c.decisao)}${lista('Tarefa do dono:', c.tarefaDono)}${lista('Espera outra carta:', c.esperaOutraCarta)}${lista('Espera puxar (F4):', c.esperaPuxar)}${lista('Espera integração:', c.esperaIntegracao)}</ul>`
    + `<p class="hg-apagado hg-mono">último job: ${esc(new Date(fim.quando).toLocaleString('pt-BR'))}</p>`;
}

function desenhar(linha, mensagem) {
  const caixa = $('hg-play-caixa');
  caixa.checked = linha?.situacao === 'ligado';
  caixa.indeterminate = linha?.situacao === 'suspenso';
  caixa.disabled = !linha;
  $('hg-play-confirma').hidden = true;
  const extra = linha?.situacao === 'suspenso' ? `: ${linha.suspenso?.motivo ?? 'releitura não conferiu'}. Religar é a saída.` : '';
  $('hg-play-estado').textContent = mensagem ?? (!linha ? 'Play indisponível para esta nave (sem Plane, congelada, Anya ou CKBL).'
    : `${SITUACAO[linha.situacao]}${extra}${linha.desde && linha.situacao !== 'desligado' ? ` Desde ${hora(linha.desde)}.` : ''}${linha.emCurso ? ` Em curso: ${linha.emCurso}.` : ''}`);
  $('hg-play-bloqueio').innerHTML = atual?.nave ? blocoBloqueio(H.zelador?.porProjeto?.[atual.nave.planePrj]) : '';
}

export async function mostrarPlay(n) {
  const minha = ++geracao;
  const bloco = $('hg-play');
  if (!n?.planePrj) { atual = null; bloco.hidden = true; return; }
  atual = { nave: n, linha: null };
  bloco.hidden = false;
  desenhar(null, 'Lendo o play…');
  try {
    const estado = await json(ROTA);
    if (minha !== geracao) return;
    atual.linha = estado.projetos.find((p) => p.projeto === n.planePrj) ?? null;
    desenhar(atual.linha, estado.legivel ? undefined : estado.observacao);
  } catch (erro) {
    if (minha === geracao) desenhar(null, `Não consegui ler o play: ${erro.message}`);
  }
}

export function esconderPlay() { geracao++; atual = null; $('hg-play').hidden = true; }

async function preparar(ligar) {
  const minha = geracao;
  const caixa = $('hg-play-caixa');
  caixa.disabled = true;
  $('hg-play-estado').textContent = 'Verificando sua sessão…';
  try {
    const dados = await json(`${ROTA}/preparar`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projeto: atual.nave.planePrj, ligar }) });
    if (minha !== geracao) return;
    if (dados.jaEstava) { desenhar(atual.linha, ligar ? 'Já estava ligado.' : 'Já estava desligado.'); return; }
    $('hg-play-aviso').textContent = dados.aviso;
    const botao = $('hg-play-confirmar');
    botao.textContent = ligar ? 'Confirmar: ligar o play' : 'Confirmar: desligar agora';
    botao.dataset.id = dados.confirmacaoId;
    botao.disabled = false;
    $('hg-play-confirma').hidden = false;
    $('hg-play-estado').textContent = `Confira e confirme até ${hora(dados.expiraEm)}.`;
  } catch (erro) {
    if (minha !== geracao) return;
    desenhar(atual.linha, erro.status === 401 ? `${erro.message} Entre em https://astargne.com/login e volte a esta aba.` : erro.message);
  }
}

async function confirmar() {
  const minha = geracao;
  const botao = $('hg-play-confirmar');
  botao.disabled = true;
  $('hg-play-estado').textContent = 'Gravando…';
  try {
    const r = await json(`${ROTA}/confirmar`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmacaoId: botao.dataset.id }) });
    if (minha !== geracao) return;
    atual.linha = { ...atual.linha, situacao: r.situacao, desde: r.desde, suspenso: null };
    atual.nave.play = r.situacao;
    desenhar(atual.linha);
  } catch (erro) {
    if (minha === geracao) desenhar(atual.linha, erro.message);
  }
}

export function ligarPlay() {
  // Suspenso desmarcado na tela pede ligar de novo: religar é a saída da divergência.
  $('hg-play-caixa').addEventListener('change', (e) => {
    if (!atual?.linha) return;
    preparar(atual.linha.situacao === 'suspenso' ? true : e.target.checked);
  });
  $('hg-play-confirmar').addEventListener('click', confirmar);
  $('hg-play-cancelar').addEventListener('click', () => { geracao++; if (atual) desenhar(atual.linha); });
}
