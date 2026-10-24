// Dorme 5 s; se sobreviver, deixa um marcador ao lado de si mesmo (o timeout deve impedir).
import fs from 'node:fs';
import path from 'node:path';
fs.readFileSync(0);
await new Promise(r => setTimeout(r, 5000));
fs.writeFileSync(path.join(path.dirname(process.argv[1]), 'sobrevivi'), 'x');
