// De quem é a sessão do Cadastro Único neste navegador, para o cabeçalho do painel. Não autoriza nada.
//
// Aceitar um convite com outro e-mail troca o cookie do domínio inteiro, e o painel
// passava a recusar as ações com "sem permissão" sem dizer por quê (31/10/2026). A
// leitura vai ao central pelo mesmo ssh do autorizador; por isso guarda o resultado
// 60 s pelo hash do cookie, para recarregar a página não abrir um ssh a cada vez.
import { createHash } from 'node:crypto';
import { ErroAcesso } from './erro-acesso.js';
import { extrairSessao } from './sessao-cookie.js';

const VALIDADE_MS = 60_000;
const MAX_GUARDADAS = 50;

export class SessaoPainel {
  constructor({ identificar, proprietarioId, agora = Date.now }) {
    this.identificar = identificar;
    this.proprietarioId = String(proprietarioId ?? '');
    this.agora = agora;
    this.guardadas = new Map();
  }

  async ler(cabecalhoCookie) {
    const token = extrairSessao(cabecalhoCookie);
    if (!token) return { estado: 'sem-sessao' };
    const chave = createHash('sha256').update(token).digest('hex');
    const g = this.guardadas.get(chave);
    if (g && this.agora() - g.em < VALIDADE_MS) return g.valor;
    let valor;
    try {
      const u = await this.identificar(token);
      valor = { estado: u.id === this.proprietarioId ? 'dono' : 'outra-conta', nome: u.nome, email: u.email };
    } catch (erro) {
      // Indisponível não fica guardado: a próxima leitura tenta de novo.
      if (!(erro instanceof ErroAcesso) || erro.status !== 401) return { estado: 'indisponivel' };
      valor = { estado: 'expirada' };
    }
    if (this.guardadas.size >= MAX_GUARDADAS) this.guardadas.delete(this.guardadas.keys().next().value);
    this.guardadas.set(chave, { em: this.agora(), valor });
    return valor;
  }
}
