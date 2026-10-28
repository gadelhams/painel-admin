// Porta do ssh das contas. O processo, a redação e a leitura da saída moram ao lado.

export { criarExecutorSsh, executarSsh } from './processo-ssh.js';
export { redigirSegredo } from './redacao.js';
export { interpretarSaida } from './saida-central.js';
