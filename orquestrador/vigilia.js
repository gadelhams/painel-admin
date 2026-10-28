// Vigília: com um projeto ligado, varre a fila e despacha a carta elegível.
// O controle (ligar, pausar) mora em vigilia-controle.js; a passada em vigilia-varredura.js;
// o diário em vigilia-diario.js. Daqui sai só a composição.
import { PROJETOS } from '../projetos.js';
import { DiarioVigilia } from './vigilia-diario.js';
import { VigiliaControle } from './vigilia-controle.js';
import { VigiliaVarredura } from './vigilia-varredura.js';

export function criarVigilia({ servico, diretorioEstado, projetos = PROJETOS, agora = Date.now, intervaloMs = 120_000,
  registrarLog = () => {} } = {}) {
  if (!servico || !diretorioEstado) throw new Error('serviço e diretório de estado obrigatórios');
  const livro = new DiarioVigilia({ diretorio: diretorioEstado, agora });
  const memoria = new Map();
  const ocupada = { atual: false };
  const controle = new VigiliaControle({ servico, projetos, agora, intervaloMs, livro, memoria, ocupada });
  const varredura = new VigiliaVarredura({ servico, projetos, intervaloMs, registrarLog, livro, memoria, controle, ocupada });
  return {
    estadoDaVigilia: () => controle.estado(),
    validarAlternancia: (projetoId, ligar) => controle.validar(projetoId, ligar),
    alternar: (projetoId, ligar, usuarioId) => controle.alternar(projetoId, ligar, usuarioId),
    varrer: () => varredura.varrer(),
    iniciar: () => varredura.iniciar(),
    parar: () => varredura.parar(),
  };
}
