// Onde o console senta: no palco ou por cima da aba. Não manda mensagem.

class ConsolePalco {
  static recolher() {
    const scrim = document.getElementById('console-scrim');
    const encaixe = document.getElementById('encaixe-voz');
    if (!encaixe || !scrim) return;
    scrim.classList.remove('console-overlay');
    scrim.hidden = false;
    encaixe.appendChild(scrim);
  }

  static overlay() {
    const scrim = document.getElementById('console-scrim');
    scrim.classList.add('console-overlay');
    scrim.hidden = false;
    document.body.appendChild(scrim);
  }

  static abrir() {
    if (viewAtual && viewAtual !== 'projetos') ConsolePalco.overlay();
    else ConsolePalco.recolher();
    document.getElementById('entrada')?.focus();
  }

  static fechar() {
    const scrim = document.getElementById('console-scrim');
    if (!scrim.classList.contains('console-overlay')) return;
    scrim.classList.remove('console-overlay');
    const encaixe = document.getElementById('encaixe-voz');
    if (encaixe) encaixe.appendChild(scrim);
    scrim.hidden = viewAtual !== 'projetos';
  }

  static chips(sugestoes) {
    document.getElementById('console-chips').replaceChildren(...sugestoes.map((texto) => {
      const chip = el('button', { type: 'button', class: 'chip-sugestao' }, texto);
      chip.addEventListener('click', () => window.mandarMensagemSeverino?.(texto));
      return chip;
    }));
  }
}

function recolherConsoleNoPalco() { ConsolePalco.recolher(); }
function posicionarConsoleOverlay() { ConsolePalco.overlay(); }
function abrirConsole() { ConsolePalco.abrir(); }
function fecharConsole() { ConsolePalco.fechar(); }
