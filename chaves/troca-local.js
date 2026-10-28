// Reescreve uma linha do .env local e reinicia a unit de usuário.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class TrocaLocal {
  constructor({ raiz, diario, agora, spawn, log }) {
    this.raiz = raiz;
    this.diario = diario;
    this.agora = agora;
    this.spawn = spawn;
    this.log = log;
  }

  caminho(p) {
    return path.join(this.raiz, p.local.arquivo);
  }

  reescrever(texto, nome, valor) {
    const linhas = texto.split('\n');
    const i = linhas.findIndex(l => l.startsWith(`${nome}=`));
    if (i >= 0) linhas[i] = `${nome}=${valor}`;
    else { if (linhas.at(-1) === '') linhas.pop(); linhas.push(`${nome}=${valor}`); }
    return `${linhas.join('\n')}\n`;
  }

  async apagarBaks(arquivo, manter) {
    const dir = path.dirname(arquivo);
    const prefixo = `${path.basename(arquivo)}.bak-`;
    for (const nome of await fs.readdir(dir)) {
      const caminho = path.join(dir, nome);
      if (nome.startsWith(prefixo) && caminho !== manter) await fs.rm(caminho, { force: true });
    }
  }

  async aplicar(p, nome, valor, usuarioId) {
    const arquivo = this.caminho(p);
    let texto = '';
    try { texto = await fs.readFile(arquivo, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const carimbo = new Date(this.agora()).toISOString().replace(/[:.]/g, '-');
    if (texto) await fs.copyFile(arquivo, `${arquivo}.bak-${carimbo}`).then(() => fs.chmod(`${arquivo}.bak-${carimbo}`, 0o600));
    const temporario = `${arquivo}.${randomUUID()}.tmp`;
    await fs.writeFile(temporario, this.reescrever(texto, nome, valor), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporario, arquivo);
    await this.apagarBaks(arquivo, `${arquivo}.bak-${carimbo}`);
    await this.diario.anotar({ tipo: 'ROTACIONADA', projeto: p.projeto, nome, alvo: 'local', usuarioId, unit: p.local.unit ?? null });
    if (p.local.unit) {
      setTimeout(() => { try { this.spawn('systemctl', ['--user', 'restart', p.local.unit], { stdio: 'ignore', detached: true }).unref(); } catch (e) { this.log(`[chaves] reinício de ${p.local.unit} falhou: ${e.message}`); } }, 1000).unref?.();
    }
    return { ok: true, alvo: 'local', arquivo: p.local.arquivo, reinicia: p.local.unit ?? null };
  }
}
