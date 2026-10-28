// Uma varredura por vez. A classificação mora em classificar-prontidao-dev.js.

import { VarreduraTriagem } from './varredura-triagem.js';

export { CATEGORIAS_DEV, classificarProntidaoDev } from './classificar-prontidao-dev.js';

export function criarTriagemDev({ consultar, concorrencia = 8 } = {}) {
  if (!Number.isInteger(concorrencia) || concorrencia < 1 || concorrencia > 16) throw new Error('concorrência de triagem inválida');
  const varredura = new VarreduraTriagem({ consultar, concorrencia });
  let emAndamento = null;
  return function triagemDev() {
    if (!emAndamento) emAndamento = varredura.executar().finally(() => { emAndamento = null; });
    return emAndamento;
  };
}
