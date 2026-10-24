// Dublê do scripts/estado_canal.py: o roteiro vem do nome do config pedido.
const config = process.argv[process.argv.indexOf('--config') + 1];
const base = { versao: 1, config, documento: 'docs/59.md', repositorio: '/r', geradoEm: '2026-10-24T00:00:00Z', commit: 'abc1234', head: 'abc1234', origin: 'abc1234',
  protocolo: 10, ultimoBloco: 'E-0040', cards: [{ id: 'C-0014', estado: 'DONO_NECESSARIO' }],
  pendencias: [{ card: 'C-0014', ator: 'DONO', acao: 'DECIDIR', motivo: 'm', chave: 'C-0014:DECIDIR:E-0040', tentativas: 0, bloqueado: false }],
  sugestoes: ['x'], integridade: [], blocosLocais: [], recusas: {}, trava: { ativa: false, idadeSegundos: null }, pausas: {},
  execucao: { arquivo: null, modificadoHa: null, cauda: '' }, emCurso: null, touchpoints: Array.from({ length: 25 }, (_, i) => ({ quando: `t${i}`, card: 'C-0014' })), erro: null };
if (config === 'ruim.json') { process.stdout.write('isto não é json'); process.exit(0); }
if (config === 'falha.json') { process.stderr.write('traceback'); process.exit(2); }
if (config === 'lento.json') { await new Promise(r => setTimeout(r, 3000)); }
process.stdout.write(`${JSON.stringify(base)}\n`);
