// Digest do dia. Sai uma vez por data local e não abre carta nem decisão.

class DigestC3po {
  static diaLocal() {
    return new Date().toLocaleDateString('en-CA');
  }

  static jaFoiHoje() {
    const hoje = DigestC3po.diaLocal();
    try {
      if (localStorage.getItem('c3po-digest-dia') === hoje) return true;
    } catch { /* sem armazenamento: a flag desta carga segura o resto */ }
    return DigestC3po.doDia === hoje;
  }

  static marcarHoje() {
    const hoje = DigestC3po.diaLocal();
    DigestC3po.doDia = hoje;
    try { localStorage.setItem('c3po-digest-dia', hoje); } catch { /* a flag desta carga segura */ }
  }
}

DigestC3po.doDia = null;

function abrirConsoleDigest() {
  document.getElementById('console-kicker').textContent = `digest · ${new Date().toLocaleDateString('pt-BR')} · ${dadosProjetos.length || 9} projetos`;
  ConsolePalco.chips(['as decisões mais velhas', 'o que travou mais projetos', 'gasto por projeto']);
  abrirConsole();
  if (DigestC3po.jaFoiHoje()) return;
  if (document.getElementById('enviar')?.disabled) return;
  DigestC3po.marcarHoje();
  window.mandarMensagemC3po?.(
    'Bom dia — resumo rápido: o que mudou desde ontem em cada projeto (git, portas, produção), e o que está parado (decisões)? Cite dado real, não invente.',
  );
}
