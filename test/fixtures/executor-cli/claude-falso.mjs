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
// Limite no formato documentado do `claude -p --output-format json`: a mensagem é do próprio
// CLI, dentro do `result`, com `is_error: true` (formato a confirmar no piloto PAINEL-34).
if (controle.limite) {
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Claude AI usage limit reached|1761868800', total_cost_usd: 0, num_turns: 1 }));
  process.exit(controle.limite === 'codigo0' ? 0 : 1);
}
// `erro`: roteiro de falha num papel (o primeiro que rodar), com stderr, stdout e código livres.
if (controle.erro && (!controle.erro.papel || controle.erro.papel === papel)) {
  if (controle.erro.stderr) process.stderr.write(controle.erro.stderr);
  if (controle.erro.stdout) process.stdout.write(typeof controle.erro.stdout === 'string' ? controle.erro.stdout : JSON.stringify(controle.erro.stdout));
  process.exit(controle.erro.codigo ?? 1);
}
if (papel === 'codificacao_testes' && controle.escrever !== false) fs.writeFileSync(path.join(process.cwd(), 'alteracao-da-ia.txt'), `tentativa ${n}\n`);
const texto = papel === 'validacao' ? `${controle.textoValidacao ?? 'Conferi o diff.'}\nVEREDITO: ${controle.veredito ?? 'APROVADO'}` : controle.texto ?? `Briefing/relatório falso do papel ${papel}.`;
process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: texto, total_cost_usd: 0.01, num_turns: 1 }));
