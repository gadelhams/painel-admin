// Entrada do handoff no card. O texto mora em protocolo-handoff.js e a escrita em escritor-handoff-plane.js.

export { validarHandoff, validarOrigemModelos, codificarHandoff, handoffsDoCanal, lerHandoffsDoCanal } from './protocolo-handoff.js';
export { criarEscritorHandoffPlane } from './escritor-handoff-plane.js';
