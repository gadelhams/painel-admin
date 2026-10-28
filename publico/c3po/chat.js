// Liga o palco, o fluxo e os modos de voz. O console chama mandarMensagemSeverino.

(() => {
  const palco = new Palco(document.getElementById('historico'));
  const enviar = document.getElementById('enviar');
  const microfone = document.getElementById('microfone');
  const entrada = document.getElementById('entrada');
  const formulario = document.getElementById('formulario');
  const conversa = new ConversaC3po({ palco, enviar, microfone, entrada });
  conversa.ligarFormulario(formulario);
  new ModosVoz(conversa, {
    microfone, entrada, formulario,
    modoCopilotoCaixa: document.getElementById('modo-copiloto'),
    rotuloCopiloto: document.getElementById('rotulo-copiloto'),
    statusCopiloto: document.getElementById('status-copiloto'),
    botaoLigacao: document.getElementById('ligar'),
    statusLigacao: document.getElementById('status-ligacao'),
  });
  window.mandarMensagemSeverino = (mensagem) => conversa.mandar(mensagem);
})();
