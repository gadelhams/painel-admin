// Frota de teste gravada pelo mesmo caminho da troca real (ArquivoFrota.gravar), nunca escrita à mão.
import { ArquivoFrota } from '../../../orquestrador/frota.js';

export const tupla = (provedor = 'claude', esforco = provedor === 'claude' ? 'max' : 'xhigh') =>
  ({ provedor, modelo: provedor === 'claude' ? 'claude-opus-5' : 'gpt-6-astra', esforco });

export const conteudoFrota = ({ orquestracao = tupla(), codificacao_testes = tupla(), validacao = tupla(), zelador = tupla() } = {}) =>
  ({ executor: { orquestracao, codificacao_testes, validacao }, zelador: { zelador } });

export async function gravarFrota(diretorio, conteudo = conteudoFrota()) {
  const arquivo = new ArquivoFrota({ diretorio });
  const atual = await arquivo.ler();
  return arquivo.gravar({ conteudo, base: atual.marca, usuarioId: '7' });
}
