// CLI codex falsa: grava o retrato ao lado de si mesma e escreve a última mensagem em -o.
import fs from 'node:fs';
import path from 'node:path';
const aqui = path.dirname(process.argv[1]);
const stdin = fs.readFileSync(0, 'utf8');
const argv = process.argv.slice(2);
const saida = argv[argv.indexOf('-o') + 1];
let controle = {};
try { controle = JSON.parse(fs.readFileSync(path.join(aqui, 'controle.json'), 'utf8')); } catch { /* sem controle */ }
const n = fs.readdirSync(aqui).filter(f => f.startsWith('registro-')).length + 1;
const papel = argv[argv.indexOf('--sandbox') + 1] === 'read-only' ? (stdin.includes('Papel: validação') ? 'validacao' : 'orquestracao') : 'codificacao_testes';
fs.writeFileSync(path.join(aqui, `registro-${String(n).padStart(2, '0')}-${papel}.json`), JSON.stringify({ argv, stdin, env: process.env, cwd: process.cwd(), papel }));
// `codex`: roteiro de falha — stderr com a transcrição e o código de saída.
if (controle.codex) { process.stderr.write(controle.codex.stderr ?? ''); process.exit(controle.codex.codigo ?? 1); }
if (papel === 'codificacao_testes') fs.writeFileSync(path.join(process.cwd(), 'alteracao-da-ia.txt'), `codex ${n}\n`);
fs.writeFileSync(saida, papel === 'validacao' ? 'Tudo certo.\nVEREDITO: APROVADO\n' : `Mensagem final falsa do codex (${papel}).\n`);
