// Porta da política da orquestração. Contrato, vigília e prontidão moram nos módulos ao lado.
export { comandoEstaticoSeguro, validarContrato, comandoPermitido } from './contrato-politica.js';
export { VIGILIA_PADRAO, errosDaVigilia, configuracaoVigilia } from './vigilia-politica.js';
export { avaliarProntidaoGate, avaliarCarta } from './prontidao.js';
