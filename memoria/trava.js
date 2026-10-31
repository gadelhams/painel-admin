// Trava entre processos por diretório (mkdir é atômico) para a memória L1 e a reflexão, com a recuperação da trava velha por rename. Não sabe o que protege.
//
// Recuperar apagando (rm + mkdir) deixava dois donos: quem viu a trava velha junto com outro
// processo apagava a trava NOVA que o outro acabara de criar (validador, 31/10/2026, B2.1).
// Agora a trava velha é renomeada para um nome único — só um consegue o rename — e o nome
// renomeado é conferido: se era nova (o outro já a tinha recriado), volta para o lugar.
// Resíduo: a trava devolvida fica fora do lugar por um instante; um terceiro processo que
// chegar exatamente nesse instante pode ficar com ela junto do dono (janela de microssegundos,
// três processos; aqui são dois: o painel e o timer da reflexão).
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';

// O relógio aqui é o de verdade, não o injetado: espera e idade da trava são tempo real.
export async function liberarTravaVelha(trava, velhaMs) {
  const lixo = `${trava}.velha.${randomUUID()}`;
  try { await fs.rename(trava, lixo); } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
  const info = await fs.stat(lixo).catch(() => null);
  if (info && Date.now() - info.mtimeMs <= velhaMs) {
    await fs.rename(lixo, trava).catch(() => {}); // era a trava nova de outro: devolve
    return false;
  }
  await fs.rm(lixo, { recursive: true, force: true });
  return true;
}

// Espera até `esperaMs` (0 = não espera: devolve null se ocupada) e roda `fn` com a trava.
export async function comTravaDiretorio(trava, fn, { velhaMs, esperaMs = 0, ocupada }) {
  const limite = Date.now() + esperaMs;
  for (;;) {
    try { await fs.mkdir(trava); break; }
    catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const info = await fs.stat(trava).catch(() => null);
      if (!info) continue; // sumiu entre o mkdir e o stat: tenta de novo
      if (Date.now() - info.mtimeMs > velhaMs) { await liberarTravaVelha(trava, velhaMs); continue; }
      if (Date.now() >= limite) return ocupada();
      await new Promise(r => setTimeout(r, 50));
    }
  }
  try { return await fn(); } finally { await fs.rm(trava, { recursive: true, force: true }).catch(() => {}); }
}
