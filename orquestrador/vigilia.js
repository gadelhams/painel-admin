// Vigília: com o play ligado, varre a fila do Hangar inteiro e despacha UMA carta elegível por vez (round-robin, teto global).
// A passada mora em vigilia-varredura.js; o passo de uma carta em passo-vigilia.js; o diário
// em vigilia-diario.js. Daqui sai só a composição. Ligar e desligar é o play (play.js, F3).
import { PROJETOS } from '../projetos.js';
import { DiarioVigilia } from './vigilia-diario.js';
import { VigiliaVarredura } from './vigilia-varredura.js';

export function criarVigilia({ servico, play, diretorioEstado, projetos = PROJETOS, agora = Date.now, intervaloMs = 120_000,
  registrarLog = () => {}, tetoDia = undefined } = {}) {
  if (!servico || !play || !diretorioEstado) throw new Error('serviço, play e diretório de estado obrigatórios');
  const livro = new DiarioVigilia({ diretorio: diretorioEstado, agora });
  const memoria = new Map();
  const ocupada = { atual: false };
  const varredura = new VigiliaVarredura({ servico, play, projetos, intervaloMs, registrarLog, livro, memoria, ocupada, ...(tetoDia ? { tetoDia } : {}) });
  return {
    // O que a tela mostra do despacho de um projeto: a última passada, sem ler disco nem Plane.
    situacao: (projetoId) => ({ varrendo: ocupada.atual, ...(memoria.get(projetoId) ?? {}) }),
    varrer: () => varredura.varrer(),
    iniciar: (podeAgendar) => varredura.iniciar(podeAgendar),
    parar: () => varredura.parar(),
  };
}
