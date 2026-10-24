// npm falso: só registra os argumentos (npm ci nunca roda de verdade em teste).
import fs from 'node:fs';
import path from 'node:path';
// Um arquivo por subcomando: `ci` e `test` não se sobrescrevem.
fs.writeFileSync(path.join(path.dirname(process.argv[1]), `npm-${process.argv[2]}.json`), JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }));
