// Palco do C-3PO: o histórico e o texto do console. Não decide turno nem fala.

class Palco {
  constructor(historico) {
    this.historico = historico;
  }

  texto(texto) {
    const alvo = document.getElementById('palco-texto');
    if (!alvo || !texto) return;
    const limpo = texto.replace(/\s+/g, ' ').trim();
    if (limpo) alvo.textContent = limpo.slice(0, 180);
  }

  estado(rotulo, vivo) {
    const alvo = document.getElementById('palco-estado');
    if (alvo) alvo.textContent = rotulo;
    document.getElementById('console-scrim')?.classList.toggle('palco-vivo', Boolean(vivo));
  }

  fala(classe, texto = '') {
    const div = document.createElement('div');
    div.className = `fala ${classe}`;
    div.textContent = texto;
    this.historico.appendChild(div);
    this.historico.scrollTop = this.historico.scrollHeight;
    if (classe === 'usuario') this.texto(texto);
    return div;
  }

  nota(classe, texto) {
    const div = document.createElement('div');
    div.className = classe;
    div.textContent = texto;
    this.historico.appendChild(div);
    this.historico.scrollTop = this.historico.scrollHeight;
    return div;
  }
}

globalThis.Palco = Palco;
