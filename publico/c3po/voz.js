// Fachada. Escuta, locutor e a política moram nos arquivos vizinhos.
// Este arquivo só junta os dois e declara a linha de status.

const Voz = (() => {
  const { GatilhoC3po } = globalThis.PoliticaFala;
  const statusVoz = document.getElementById('status-voz');

  function diag(evento, dados = {}) {
    try {
      const corpo = JSON.stringify({ evento, t: new Date().toISOString(), ua: navigator.userAgent.slice(0, 80), ...dados });
      if (!navigator.sendBeacon?.('/api/diagnostico/voz', new Blob([corpo], { type: 'application/json' }))) {
        fetch('/api/diagnostico/voz', { method: 'POST', body: corpo, keepalive: true }).catch(() => {});
      }
    } catch { /* diagnóstico nunca atrapalha */ }
  }

  let pronto = false;
  const aoMudar = () => { if (pronto) atualizarStatus(); };
  const locutor = new Locutor({ diag, aoMudar });
  const escuta = new Escuta({
    diag,
    aoMudar,
    emFala: () => locutor.emFala(),
    pareceEco: (texto) => locutor.pareceEco(texto),
  });

  function atualizarStatus() {
    if (!statusVoz) return;
    const microfone = escuta.resumo();
    const voz = locutor.resumo();
    const partes = [];
    if (!microfone.temReconhecimento) {
      partes.push(microfone.temGravacao && microfone.xaiDisponivel
        ? 'microfone: transcrição xAI (este navegador não tem reconhecimento próprio)'
        : 'microfone indisponível neste navegador — use Edge ou Chrome');
    }
    if (voz.elevenDisponivel === true) partes.push('voz: ElevenLabs');
    else if (voz.elevenDisponivel === null) partes.push('voz: conferindo a ElevenLabs…');
    else if (voz.temSintese && voz.vozEscolhida) {
      partes.push(voz.vozEhAntonio
        ? `voz: Antônio — ${voz.motivo}`
        : `voz: "${voz.vozEscolhida.name}" — ${voz.motivo}, e o Antônio não está neste navegador`);
    } else if (voz.temSintese && !voz.vozesCarregadas) partes.push(`${voz.motivo} — procurando voz do navegador…`);
    else {
      partes.push(`só texto — ${voz.motivo}, e ${voz.temSintese
        ? 'nenhuma voz pt-BR neste navegador'
        : 'a síntese de voz não existe neste navegador'}`);
    }
    statusVoz.textContent = partes.join(' · ');
    statusVoz.classList.toggle('atencao', !microfone.temReconhecimento || voz.elevenDisponivel !== true);
  }

  pronto = true;
  atualizarStatus();

  return {
    temReconhecimento: escuta.temReconhecimento,
    temGravacao: escuta.temGravacao,
    xaiDisponivel: () => escuta.xaiDisponivel,
    temSintese: locutor.temSintese,
    criarLocutor: (opcoes) => locutor.criar(opcoes),
    calar: () => locutor.calar(),
    pareceEco: (texto) => locutor.pareceEco(texto),
    ouvir: (opcoes) => escuta.ouvir(opcoes),
    ouvirContinuo: (opcoes) => escuta.ouvirContinuo(opcoes),
    ouvirXai: (opcoes) => escuta.ouvirXai(opcoes),
    ouvirContinuoXai: (opcoes) => escuta.ouvirContinuoXai(opcoes),
    detectarGatilho: (texto) => GatilhoC3po.detectar(texto),
  };
})();
