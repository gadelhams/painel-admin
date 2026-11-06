// Liberação do jogo nativo por projeto: o dono liga na nave do Hangar quando a Steam está livre. Não abre jogo nenhum.
//
// O teste no jogo (grim + ydotool no Omarchy) toma a tela e a conta da Steam; se o
// dono estiver jogando com a mesma conta em outra máquina, abrir o jogo derruba a
// sessão dele. Por isso a liberação tem prazo e vence sozinha: esquecer ligada não
// pode valer para sempre. A exceção é o "sem prazo" (PAINEL-67), que o dono escolhe
// por extenso quando viaja e deixa a máquina ligada: vale até ele desligar. Arquivo
// ilegível, forma estranha ou prazo vencido contam como desligado, e quem consome (o
// pré-flight nativo) lê só esta rota.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { recusa } from './contrato-local.js';

export const HORAS_LIBERACAO = Object.freeze([2, 4, 8, 12]);
// Vai no campo `horas` do preparar, no lugar de um dos prazos fechados.
export const SEM_PRAZO = 'sem-prazo';

const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const data = v => typeof v === 'string' && Number.isFinite(Date.parse(v));
// Sem prazo só vale escrito por extenso (`semPrazo: true` com `ate: null`): registro que
// apenas perdeu o `ate` é forma estranha, não liberação eterna.
const registroValido = r => objeto(r) && data(r.desde) && typeof r.usuarioId === 'string'
  && (r.semPrazo === true ? r.ate === null : data(r.ate));

export class LiberacaoNativa {
  constructor({ diretorio, projetos = PROJETOS, agora = Date.now }) {
    this.diretorio = diretorio;
    this.arquivo = path.join(diretorio, 'liberacao-nativa.json');
    this.projetos = projetos.filter(p => p.jogoNativo && p.plane);
    this.conhecidos = new Set(this.projetos.map(p => p.plane));
    this.agora = agora;
    this.fila = Promise.resolve();
  }

  async lerArquivo() {
    let dados;
    try { dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8')); }
    catch (e) { return e.code === 'ENOENT' ? { legivel: true, registros: {} } : { legivel: false, registros: {} }; }
    // Registro de projeto fora do catálogo também é forma estranha: sem isso, a gravação de
    // outro projeto o preservaria calado. Não fecha tudo: se o projeto sai do catálogo sem
    // ninguém regravar o arquivo e depois volta, o registro (até sem prazo) volta a valer.
    const valido = objeto(dados) && Object.entries(dados).every(([id, r]) => this.conhecidos.has(id) && registroValido(r));
    return valido ? { legivel: true, registros: dados } : { legivel: false, registros: {} };
  }

  linha(p, registro) {
    const semPrazo = registro?.semPrazo === true;
    const ate = registro && !semPrazo ? Date.parse(registro.ate) : NaN;
    const liberada = semPrazo || (Number.isFinite(ate) && ate > this.agora());
    return { projeto: p.plane, pasta: p.pasta, titulo: p.titulo, jogo: p.jogoNativo, liberada, semPrazo,
      ate: liberada && !semPrazo ? registro.ate : null, desde: liberada ? registro.desde : null };
  }

  async estado() {
    const { legivel, registros } = await this.lerArquivo();
    return { legivel, horas: [...HORAS_LIBERACAO], agora: new Date(this.agora()).toISOString(),
      projetos: this.projetos.map(p => this.linha(p, registros[p.plane])),
      observacao: legivel ? 'Liberado só até a hora em "ate"; depois disso conta como desligado. Com "semPrazo": true não há "ate": vale até o dono desligar.'
        : 'Arquivo de liberação ilegível: nenhum projeto está liberado. Desligar regrava o arquivo do zero; consertá-lo à mão pode trazer de volta uma liberação guardada nele.' };
  }

  projeto(id) {
    const p = this.projetos.find(x => x.plane === id);
    if (!p) throw recusa('projeto sem jogo nativo no catálogo');
    return p;
  }

  // horas = 0 desliga; senão é um dos prazos fechados ou SEM_PRAZO.
  async validar(id, horas) {
    const semPrazo = horas === SEM_PRAZO;
    if (horas !== 0 && !semPrazo && !HORAS_LIBERACAO.includes(horas)) throw recusa('prazo fora da lista');
    const p = this.projeto(id);
    const { legivel, registros } = await this.lerArquivo();
    const atual = this.linha(p, registros[id]);
    const ate = horas && !semPrazo ? new Date(this.agora() + horas * 3_600_000).toISOString() : null;
    const steamLivre = 'Só ligue com a Steam livre: quem abrir o jogo derruba a sua sessão se você estiver jogando com a mesma conta';
    // Ilegível lê como desligado, mas o arquivo pode guardar uma liberação (até sem prazo) que
    // voltaria a valer se alguém o consertasse: aí o desligar não é "já estava", é a regravação.
    return { nome: p.titulo, jogo: p.jogoNativo, ligar: horas !== 0, semPrazo, ate, jaEstava: !horas && legivel && !atual.liberada,
      aviso: semPrazo
        ? `Confirmar libera a frota e o orquestrador a abrir ${p.jogoNativo} neste PC sem prazo: não desliga sozinho, nem com o painel ou o PC reiniciado, e vale até você desligar aqui. ${steamLivre}, e isso segue valendo quando você voltar a jogar.`
        : horas
          ? `Confirmar libera a frota e o orquestrador a abrir ${p.jogoNativo} neste PC por ${horas} h. ${steamLivre}.`
          : legivel ? `Confirmar desliga a liberação agora. Uma janela nativa que já começou termina o caso em curso e não abre outro Load.`
            : `O arquivo de liberação está ilegível. Confirmar regrava o arquivo do zero, com todos os projetos desligados, e apaga qualquer liberação guardada nele, inclusive sem prazo.` };
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
        const desde = new Date(agora).toISOString();
        novos[id] = horas === SEM_PRAZO ? { desde, ate: null, semPrazo: true, usuarioId }
          : { desde, ate: new Date(agora + horas * 3_600_000).toISOString(), usuarioId };
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
