// Reescreve uma linha do .env no servidor pelo script fixo. O valor vai no stdin.

import { ErroAcesso } from '../orquestrador/sso.js';
import { NOME, UNIT, ARQUIVO_SERVIDOR, CHAVE_SSH, DESTINO_SSH } from './catalogo.js';

const PYTHON_REMOTO = 'import sys,os,shutil,time,glob\nos.umask(0o077)\narq,nome=sys.argv[1],sys.argv[2]\nvalor=sys.stdin.read().rstrip("\\n")\nif not valor or "\\n" in valor or "\\r" in valor: sys.exit(97)\nst=os.stat(arq)\ntexto=open(arq,encoding="utf-8").read()\nlinhas=texto.split("\\n")\nif linhas and linhas[-1]=="": linhas.pop()\nfor i,l in enumerate(linhas):\n  pref="export " if l.startswith("export "+nome+"=") else ""\n  if pref or l.startswith(nome+"="): linhas[i]=pref+nome+"="+valor; break\nelse: linhas.append(nome+"="+valor)\nbak=arq+".bak-"+time.strftime("%Y%m%d%H%M%S")+"-"+str(os.getpid())\nshutil.copy2(arq, bak)\ntmp=arq+".tmp-"+str(os.getpid())\nfd=os.open(tmp, os.O_WRONLY|os.O_CREAT|os.O_EXCL, 0o600)\nos.write(fd, ("\\n".join(linhas)+"\\n").encode("utf-8"))\nos.close(fd)\nos.chown(tmp, st.st_uid, st.st_gid)\nos.chmod(tmp, 0o600)\nos.replace(tmp, arq)\nfor velho in glob.glob(glob.escape(arq)+".bak-*"):\n  if velho!=bak: os.remove(velho)\nprint("OK")';

export class TrocaServidor {
  constructor({ diario, trocaSsh, cache }) {
    this.diario = diario;
    this.trocaSsh = trocaSsh;
    this.cache = cache;
  }

  script(arquivo, nome, unit) {
    if (!ARQUIVO_SERVIDOR.test(arquivo) || !NOME.test(nome) || !UNIT.test(unit)) throw new ErroAcesso('alvo do servidor inválido', 422);
    return `sudo python3 -c '${PYTHON_REMOTO}' '${arquivo}' '${nome}' && sudo systemctl restart '${unit}' && echo REINICIADO`;
  }

  async aplicar(p, nome, valor, usuarioId) {
    const arquivo = this.cache.atual.arquivos[p.projeto].arquivo;
    const r = await this.trocaSsh(['-i', CHAVE_SSH, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', DESTINO_SSH, this.script(arquivo, nome, p.servidor.unit)], valor);
    if (r.codigo !== 0 || !r.stdout.includes('OK')) {
      await this.diario.anotar({ tipo: 'ROTACAO_INCERTA', projeto: p.projeto, nome, alvo: 'servidor', usuarioId, codigo: r.codigo });
      throw new Error('troca no servidor não confirmada; conferir o arquivo e o serviço antes de repetir');
    }
    await this.diario.anotar({ tipo: 'ROTACIONADA', projeto: p.projeto, nome, alvo: 'servidor', usuarioId, unit: p.servidor.unit, reiniciado: r.stdout.includes('REINICIADO') });
    return { ok: true, alvo: 'servidor', arquivo, reiniciou: r.stdout.includes('REINICIADO') };
  }
}
