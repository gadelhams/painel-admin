// Compõe as seções do projeto. Cada bloco mora no arquivo ao lado.

class SecoesProjeto {
  static idade(iso) { return IdadeCurta.de(iso); }
  static chips(painel, decisoes) { return SecaoCabecalho.chips(painel, decisoes); }
  static cabecalho(painel, projeto, prBacklog, decisoes) { return SecaoCabecalho.desenhar(painel, projeto, prBacklog, decisoes); }
  static outline(prBacklog, tagAtiva) { return SecaoOutline.desenhar(prBacklog, tagAtiva); }
  static mermaid(conteudoMd) { return SecaoArquitetura.mermaid(conteudoMd); }
  static modeladores(pasta, modeladores) { return SecaoArquitetura.modeladores(pasta, modeladores); }
  static arquitetura(projeto, docs) { return SecaoArquitetura.desenhar(projeto, docs); }
  static linhaDecisao(decisao, ehMaisVelha) { return SecaoDecisoes.linha(decisao, ehMaisVelha); }
  static decisoesParadas(pasta) { return SecaoDecisoes.desenhar(pasta); }
  static fila() { return SecaoFila.desenhar(); }
  static producao() { return SecaoProducao.desenhar(); }
}

SecoesProjeto.COM_DIAGRAMA = SecaoArquitetura.COM_DIAGRAMA;
globalThis.SecoesProjeto = SecoesProjeto;
