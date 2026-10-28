// Entrada do Hangar: liga dados, simulação, cena e interface, e pausa tudo quando a aba sai de vista. O roteador chama window.hangar.entrar/sair.

import { H, ouvir } from './estado.js';
import { $, plural } from './util.js';
import { carregarHangar, carregarSessoes, carregarSondas } from './dados.js';
import { reconciliar, gerirDocas, lugar, passo } from './simulacao.js';
import { montarCena, desenhar, rumoDaRosa } from './cena.js';
import { iniciarRotulos, posicionarRotulos, atualizarRotulos } from './rotulos.js';
import { iniciarInterface, atualizarPaineis, clicar, fecharPopup, posicionarPopup } from './interface.js';
import { falar, tickFala } from './narrador.js';

// Naves seguem o cache de 60 s do Plane; droids, o poll barato de 5 s; sondas fazem HTTPS de verdade, então devagar.
const PERIODOS = { sessoes: 5_000, hangar: 60_000, sondas: 120_000 };
let iniciado = false;
let ativo = false;
let timers = [];
let ultimo = 0;
let ui = 0;

function ajustarAltura() {
  const s = $('aba-hangar');
  s.style.setProperty('--hg-topo', `${Math.round(s.getBoundingClientRect().top + scrollY)}px`);
}

async function iniciar() {
  ouvir('sessoes', (lista) => reconciliar(lista, H.carregado));
  await carregarHangar();
  await carregarSessoes();
  gerirDocas(0, true);
  for (const d of H.droids) d.pos = lugar(d);
  H.carregado = true;
  carregarSondas(true);
  iniciarInterface();
  iniciarRotulos($('hg-rotulos'), clicar);
  const docadas = H.naves.filter((n) => n.estado === 'docada').length; const k = H.droids.length;
  falar(H.erroHangar
    ? 'Oh, céus! Não consegui ler o Plane, mestre. Mostro os droids, mas as naves ficam no pátio até ele responder.'
    : `Oh, olá! Eu sou o C-3PO. ${k ? `${k} ${plural(k, 'droid', 'droids')} em serviço` : 'Nenhum droid em serviço'}, ${docadas} ${plural(docadas, 'nave', 'naves')} nas docas e ${H.naves.length - docadas} no pátio do Plane. Clique em qualquer estrutura que eu explico.`);
  atualizarPaineis();
  await montarCena($('hg-camada'), $('hg-aviso'), clicar, fecharPopup);
}

function quadro(agora) {
  if (!ativo) return;
  const dt = Math.min(0.1, (agora - ultimo) / 1000); ultimo = agora;
  passo(dt); tickFala(dt);
  desenhar(dt); posicionarRotulos(); posicionarPopup();
  $('hg-rosa-g').setAttribute('transform', `rotate(${rumoDaRosa().toFixed(1)})`);
  ui += dt;
  if (ui > 0.3) { ui = 0; atualizarPaineis(0.3); atualizarRotulos(); }
  requestAnimationFrame(quadro);
}

function ligar() {
  if (ativo || document.hidden) return;
  ativo = true;
  timers = [
    setInterval(carregarSessoes, PERIODOS.sessoes),
    setInterval(carregarHangar, PERIODOS.hangar),
    setInterval(carregarSondas, PERIODOS.sondas),
  ];
  ultimo = performance.now();
  requestAnimationFrame(quadro);
}

function desligar() {
  ativo = false;
  timers.forEach(clearInterval); timers = [];
}

let naAba = false;
async function entrar() {
  naAba = true;
  ajustarAltura();
  if (!iniciado) {
    iniciado = true;
    try {
      await iniciar();
    } catch (e) {
      $('hg-aviso')?.replaceChildren(`O Hangar não abriu: ${e.message}`);
      return;
    }
  } else {
    // voltando à aba: põe os droids em dia antes de animar
    await carregarSessoes();
  }
  if (naAba) ligar();
}

function sair() {
  naAba = false;
  desligar();
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) desligar();
  else if (naAba && iniciado) { carregarSessoes(); ligar(); }
});
addEventListener('resize', () => { if (naAba) ajustarAltura(); });

window.hangar = { entrar, sair };
window.dispatchEvent(new Event('hangar-pronto'));
