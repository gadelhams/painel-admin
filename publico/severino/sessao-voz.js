// Quem decide se a frase ouvida vira turno. Sem microfone, sem alto-falante,
// sem rede. O chat só pinta o que esta sessão devolver.

class SessaoConversa {
  static HIATO_MS = 90_000;

  constructor() {
    this.estado = 'dormente';
    this.ultimaAtividade = 0;
  }

  // Push-to-talk não atropela uma resposta em curso: o texto espera no campo.
  receberPtt({ texto, ocupado }) {
    if (ocupado) return { agir: 'guardar', texto };
    return { agir: 'enviar', texto };
  }

  // Copiloto dormente só acorda no gatilho. Com resposta em curso, ignora.
  receberCopiloto({ texto, ocupado, agora = Date.now(), gatilho }) {
    if (ocupado) return { agir: 'ignorar', texto: '' };
    if (this.estado === 'dormente') {
      if (!gatilho?.encontrado) return { agir: 'ignorar', texto: '' };
      this.estado = 'ativa';
      this.ultimaAtividade = agora;
      return { agir: 'acordar', texto: gatilho.resto || '' };
    }
    this.ultimaAtividade = agora;
    return { agir: 'enviar', texto };
  }

  // Ligação: eco da própria boca não é turno. O resto substitui a resposta.
  receberLigacao({ texto, eco }) {
    if (eco) return { agir: 'ignorar', texto: '' };
    return { agir: 'enviar', texto };
  }

  // 90s sem fala: narrar o jogo não é conversa. Devolve true na virada.
  vencerHiato(agora = Date.now(), limite = SessaoConversa.HIATO_MS) {
    if (this.estado !== 'ativa') return false;
    if (agora - this.ultimaAtividade <= limite) return false;
    this.estado = 'dormente';
    return true;
  }

  // Falar por cima só corta quando a frase não é eco nem um interim de uma palavra.
  static deveInterromper({ candidato, eco, interimCurto }) {
    if (!candidato || eco || interimCurto) return false;
    return true;
  }
}

globalThis.SessaoConversa = SessaoConversa;
