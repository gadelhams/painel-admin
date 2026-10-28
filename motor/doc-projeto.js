// Lê ou lista um .md dentro da pasta do projeto. Não registra a ferramenta.

import { resolverDentroDaRaiz, trechosDoNome, listarModeladores, lerArquivoMd } from '../coletores.js';

export class DocProjeto {
  async ler({ projeto, arquivo }) {
    const dirProjeto = resolverDentroDaRaiz(...trechosDoNome(projeto));
    if (!dirProjeto) {
      return { content: [{ type: 'text', text: 'Caminho de projeto inválido: precisa ser uma pasta direta da raiz, sem "..".' }], isError: true };
    }
    if (!arquivo) {
      const modeladores = await listarModeladores(dirProjeto).catch(() => null);
      if (modeladores === null) {
        return { content: [{ type: 'text', text: `Não achei a pasta "${projeto}" na raiz. Use estado_projetos para ver os nomes exatos das pastas.` }], isError: true };
      }
      if (modeladores.length === 0) {
        return { content: [{ type: 'text', text: `A pasta "${projeto}" não tem documento modelador (.md) visível.` }] };
      }
      return { content: [{ type: 'text', text: `Documentos modeladores de "${projeto}":\n${modeladores.join('\n')}\nChame de novo com o parâmetro "arquivo" para ler um deles.` }] };
    }
    if (!arquivo.toLowerCase().endsWith('.md')) {
      return { content: [{ type: 'text', text: 'Só leio arquivos .md (documentos modeladores). Nada de código, .env ou segredo.' }], isError: true };
    }
    const alvo = resolverDentroDaRaiz(...trechosDoNome(projeto), arquivo);
    if (!alvo) {
      return { content: [{ type: 'text', text: 'Caminho de arquivo inválido: precisa ficar dentro da pasta do projeto, sem "..".' }], isError: true };
    }
    try {
      return { content: [{ type: 'text', text: await lerArquivoMd(alvo) }] };
    } catch {
      return { content: [{ type: 'text', text: `Não achei "${arquivo}" dentro de "${projeto}".` }], isError: true };
    }
  }
}
