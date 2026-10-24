// CLI claude falsa: grava argv, stdin, env e cwd ao lado de si mesma e responde como
// `claude -p --output-format json`. O arquivo controle.json ao lado muda o roteiro.
import fs from 'node:fs';
import path from 'node:path';
const aqui = path.dirname(process.argv[1]);
const stdin = fs.readFileSync(0, 'utf8');
let controle = {};
try { controle = JSON.parse(fs.readFileSync(path.join(aqui, 'controle.json'), 'utf8')); } catch { /* sem controle */ }
const n = fs.readdirSync(aqui).filter(f => f.startsWith('registro-')).length + 1;
const papel = process.argv.includes('--restricted') ? (stdin.includes('Papel: validação') ? 'validacao' : 'orquestracao') : 'codificacao_testes';
fs.writeFileSync(path.join(aqui, `registro-${String(n).padStart(2, '0')}-${papel}.json`),
  JSON.stringify({ argv: process.argv.slice(2), stdin, env: process.env, cwd: process.cwd(), papel }));
if (controle.limite) { process.stderr.write("You've hit your usage limit · resets 4am\n"); process.exit(1); }
if (papel === 'codificacao_testes' && controle.escrever !== false) fs.writeFileSync(path.join(process.cwd(), 'alteracao-da-ia.txt'), `tentativa ${n}\n`);
const texto = papel === 'validacao' ? `Conferi o diff.\nVEREDITO: ${controle.veredito ?? 'APROVADO'}` : controle.texto ?? `Briefing/relatório falso do papel ${papel}.`;
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: texto, total_cost_usd: 0.01, num_turns: 1 }));
