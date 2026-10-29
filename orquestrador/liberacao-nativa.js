// Liberação do jogo nativo por projeto: o dono liga na nave do Hangar quando a Steam está livre. Não abre jogo nenhum.
//
// O teste no jogo (grim + ydotool no Omarchy) toma a tela e a conta da Steam; se o
// dono estiver jogando com a mesma conta em outra máquina, abrir o jogo derruba a
// sessão dele. Por isso a liberação tem prazo e vence sozinha: esquecer ligada não
// pode valer para sempre. Arquivo ilegível, forma estranha ou prazo vencido contam
// como desligado, e quem consome (o pré-flight nativo) lê só esta rota.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { recusa } from './contrato-local.js';

export const HORAS_LIBERACAO = Object.freeze([2, 4, 8, 12]);

const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export class LiberacaoNativa {
  constructor({ diretorio, projetos = PROJETOS, agora = Date.now }) {
    this.diretorio = diretorio;
    this.arquivo = path.join(diretorio, 'liberacao-nativa.json');
    this.projetos = projetos.filter(p => p.jogoNativo && p.plane);
    this.agora = agora;
    this.fila = Promise.resolve();
  }

  async lerArquivo() {
    let dados;
    try { dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8')); }
    catch (e) { return e.code === 'ENOENT' ? { legivel: true, registros: {} } : { legivel: false, registros: {} }; }
    const valido = objeto(dados) && Object.values(dados).every(r => objeto(r) && Number.isFinite(Date.parse(r.ate))
      && Number.isFinite(Date.parse(r.desde)) && typeof r.usuarioId === 'string');
    return valido ? { legivel: true, registros: dados } : { legivel: false, registros: {} };
  }

  linha(p, registro) {
    const ate = registro ? Date.parse(registro.ate) : NaN;
    const liberada = Number.isFinite(ate) && ate > this.agora();
    return { projeto: p.plane, pasta: p.pasta, titulo: p.titulo, jogo: p.jogoNativo, liberada,
      ate: liberada ? registro.ate : null, desde: liberada ? registro.desde : null };
  }

  async estado() {
    const { legivel, registros } = await this.lerArquivo();
    return { legivel, horas: [...HORAS_LIBERACAO], agora: new Date(this.agora()).toISOString(),
      projetos: this.projetos.map(p => this.linha(p, registros[p.plane])),
      observacao: legivel ? 'Liberado só até a hora em "ate"; depois disso conta como desligado.'
        : 'Arquivo de liberação ilegível: nenhum projeto está liberado até o dono religar.' };
  }

  projeto(id) {
    const p = this.projetos.find(x => x.plane === id);
    if (!p) throw recusa('projeto sem jogo nativo no catálogo');
    return p;
  }

  // horas = 0 desliga; senão é um dos prazos fechados.
  async validar(id, horas) {
    if (horas !== 0 && !HORAS_LIBERACAO.includes(horas)) throw recusa('prazo fora da lista');
    const p = this.projeto(id);
    const atual = this.linha(p, (await this.lerArquivo()).registros[id]);
    const ate = horas ? new Date(this.agora() + horas * 3_600_000).toISOString() : null;
    return { nome: p.titulo, jogo: p.jogoNativo, ligar: horas > 0, ate, jaEstava: !horas && !atual.liberada,
      aviso: horas
        ? `Confirmar libera a frota e o orquestrador a abrir ${p.jogoNativo} neste PC por ${horas} h. Só ligue com a Steam livre: quem abrir o jogo derruba a sua sessão se você estiver jogando com a mesma conta.`
        : `Confirmar desliga a liberação agora. Uma janela nativa que já começou termina o caso em curso e não abre outro Load.` };
  }

  // Serializado no processo: duas confirmações seguidas não se sobrescrevem.
  alternar(id, horas, usuarioId) {
    const vez = this.fila.then(async () => {
      const p = this.projeto(id);
      const { legivel, registros } = await this.lerArquivo();
      // Ilegível é regravado do zero: é a saída explícita, como nas pausas da frota.
      const novos = legivel ? { ...registros } : {};
      if (horas) {
        const agora = this.agora();
        novos[id] = { desde: new Date(agora).toISOString(), ate: new Date(agora + horas * 3_600_000).toISOString(), usuarioId };
      } else delete novos[id];
      await fs.mkdir(this.diretorio, { recursive: true });
      const temporario = `${this.arquivo}.${randomUUID()}.tmp`;
      await fs.writeFile(temporario, JSON.stringify(novos), { flag: 'wx' });
      await fs.rename(temporario, this.arquivo);
      return { nome: p.titulo, ...this.linha(p, novos[id]) };
    });
    this.fila = vez.catch(() => {});
    return vez;
  }
}
