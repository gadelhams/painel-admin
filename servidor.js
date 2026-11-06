// Servidor único do painel-admin desde a fusão de 14/08/2026: lê o ambiente, monta o painel com as dependências reais (montagem.js) e escuta em 127.0.0.1; não compõe serviço nem decide rota.
//
// Dashboard na raiz (/), C-3PO em /c3po/, e toda a API na mesma porta 7777.
// Escuta só em 127.0.0.1, NUNCA em 0.0.0.0, e não tem autenticação: fora do
// loopback, a única entrada é a borda do tailnet, aberta a todo aparelho do
// tailnet menos o racknerd (06/11/2026); Host e origem são conferidos em guarda.js.

import http from 'node:http';
import path from 'node:path';
import { montarPainel } from './montagem.js';

// Defesa em profundidade para o .env: o `npm start` já passa
// --env-file-if-exists, mas o gatilho do workspace da raiz sobe o servidor
// com `node servidor.js` seco — sem esta carga, a chave da ElevenLabs não
// existiria nesse caminho. loadEnvFile não sobrescreve variável já definida;
// caminho absoluto porque o cwd de quem nos inicia varia.
try {
  process.loadEnvFile(path.join(import.meta.dirname, '.env'));
} catch {
  // sem .env é estado normal (a camada ElevenLabs fica indisponível e avisa)
}

const PORTA = Number(process.env.PORTA ?? 7777);
const painel = montarPainel({ ambiente: process.env, porta: PORTA });
painel.iniciar();

const servidor = http.createServer(painel.atender);

servidor.listen(PORTA, '127.0.0.1', () => {
  console.log(`Painel administrativo (com o C-3PO a bordo) em http://localhost:${PORTA}`);
});
