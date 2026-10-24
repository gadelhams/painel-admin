// Adaptador do canal legado: python falso em node; nada do SupervisorHandoff real é tocado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { criarLeitorCanalLegado } from '../orquestrador/canal-legado.js';

const SCRIPT = path.join(import.meta.dirname, 'fixtures', 'canal-legado', 'leitor-falso.mjs');

async function pasta(configs) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'orq-legado-'));
  for (const c of configs) await fs.writeFile(path.join(dir, c), '{}');
  return dir;
}

test('normaliza o JSON do leitor, limita touchpoints a 20 e marca config ausente sem executar nada', async () => {
  const dir = await pasta(['config.supervisor.json']);
  let spawns = 0;
  const { spawn } = await import('node:child_process');
  const ler = criarLeitorCanalLegado({ diretorioSupervisor: dir, executavel: process.execPath, script: SCRIPT,
    configs: ['config.supervisor.json', 'config.json'], spawn: (...a) => { spawns++; return spawn(...a); } });
  const r = await ler();
  assert.equal(r.canais.length, 2);
  const [plataforma, lore] = r.canais;
  assert.equal(plataforma.disponivel, true);
  assert.equal(plataforma.pendencias[0].chave, 'C-0014:DECIDIR:E-0040');
  assert.equal(plataforma.touchpoints.length, 20);
  assert.equal(plataforma.trava.ativa, false);
  assert.deepEqual(lore, { config: 'config.json', disponivel: false, motivo: 'config ausente nesta máquina' });
  assert.equal(spawns, 1, 'config ausente não dispara processo');
  assert.match(r.observacao, /não migram/);
  await fs.rm(dir, { recursive: true, force: true });
});

test('cache evita um python por clique; JSON ruim, código de saída e timeout viram indisponível com motivo', async () => {
  const dir = await pasta(['config.supervisor.json', 'ruim.json', 'falha.json', 'lento.json']);
  let spawns = 0;
  let tempo = 1_000_000;
  const { spawn } = await import('node:child_process');
  const ler = criarLeitorCanalLegado({ diretorioSupervisor: dir, executavel: process.execPath, script: SCRIPT,
    configs: ['config.supervisor.json', 'ruim.json', 'falha.json', 'lento.json'], timeoutMs: 500, cacheMs: 60_000,
    agora: () => tempo, spawn: (...a) => { spawns++; return spawn(...a); } });
  const r = await ler();
  assert.deepEqual(r.canais.map(c => [c.disponivel, c.motivo ?? null]), [
    [true, null], [false, 'saída do leitor legado ilegível: Unexpected token \'i\', "isto não é json" is not valid JSON'],
    [false, 'leitor legado terminou com código 2'], [false, 'leitor legado excedeu 1 s']]);
  assert.equal(spawns, 4);
  await ler();
  assert.equal(spawns, 4, 'segunda leitura dentro do cache não forka');
  tempo += 61_000;
  await ler();
  assert.equal(spawns, 8, 'cache vencido relê');
  await fs.rm(dir, { recursive: true, force: true });
});

test('a aba carrega o canal legado só no tópico, sem innerHTML, e o servidor expõe a rota antes do 405', async () => {
  const front = await fs.readFile(new URL('../publico/orquestrador.js', import.meta.url), 'utf8');
  const html = await fs.readFile(new URL('../publico/index.html', import.meta.url), 'utf8');
  const servidor = await fs.readFile(new URL('../servidor.js', import.meta.url), 'utf8');
  assert.match(html, /data-orq-topico="legado"/);
  assert.match(html, /id="orq-topico-legado"/);
  const bloco = front.slice(front.indexOf('async function carregarLegado'), front.indexOf('async function carregarConsumo'));
  assert.ok(bloco.length > 100, 'carregarLegado existe antes de carregarConsumo');
  assert.doesNotMatch(bloco, /innerHTML/);
  assert.match(front, /if \(nome === 'legado'\) carregarLegado\(\)/);
  assert.equal((front.match(/\/api\/orquestracao\/legado/g) ?? []).length, 1);
  assert.ok(servidor.indexOf("pathname === '/api/orquestracao/legado'") < servidor.indexOf("pathname.startsWith('/api/orquestracao')"));
});
