// Apenas estáticos do Painel. Não importa servidor.js, .env ou clientes reais.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../publico');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end();
    return;
  }
  const url = new URL(req.url, 'http://127.0.0.1:17777');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('fixture');
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(404, { 'content-type': 'application/json' }).end('{"erro":"API não simulada"}');
    return;
  }
  let relativo;
  try { relativo = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); }
  catch { res.writeHead(400).end(); return; }
  const arquivo = path.resolve(raiz, '.' + relativo);
  if (arquivo !== raiz && !arquivo.startsWith(raiz + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const conteudo = await readFile(arquivo);
    res.writeHead(200, { 'content-type': mime[path.extname(arquivo)] ?? 'application/octet-stream',
      'cache-control': 'no-store' }).end(req.method === 'HEAD' ? undefined : conteudo);
  } catch { res.writeHead(404).end(); }
}).listen(17777, '127.0.0.1');
