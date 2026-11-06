// De quem é a sessão do Cadastro Único neste navegador: o selo do cabeçalho (`ler`) e o veredito do portão da borda (`lerParaEntrada`). Não autoriza ação privilegiada: essa confere no central sem cache, em autorizador.js.
//
// Aceitar um convite com outro e-mail troca o cookie do domínio inteiro, e o painel
// passava a recusar as ações com "sem permissão" sem dizer por quê (31/10/2026). A
// leitura vai ao central pelo mesmo ssh do autorizador (~3,6 s medidos em 06/11/2026);
// por isso guarda o resultado 60 s pelo hash do cookie.
//
// O portão (PAINEL-64) pergunta a cada pedido da borda e não pode parar 3,6 s por minuto:
// para ele, veredito `dono` com até 5 min segue valendo enquanto UMA revalidação roda em
// segundo plano. A idade conta do INÍCIO da verificação, então "5 min" é o teto de verdade
// entre o central dizer sim e o painel ainda aceitar. Relógio que anda para trás deixa a
// idade negativa: conta como vencida (com relógio monotônico a entrada atravessaria a
// suspensão da máquina).
import { createHash } from 'node:crypto';
import { ErroAcesso } from './erro-acesso.js';
import { situacaoDoCookie } from './sessao-cookie.js';

const FRESCA_MS = 60_000;
const TOLERADA_MS = 5 * 60_000;
const MAX_GUARDADAS = 50;
// Cada verificação é um ssh ao servidor: cookies distintos em rajada não podem virar
// dezenas de conexões (o MaxStartups do sshd de lá recusaria também as do autorizador).
// O teto vale para cookie DESCONHECIDO: quem já foi visto como dono verifica sempre, senão
// qualquer aparelho do tailnet, mandando cookies lixo ao selo (que não passa pelo portão),
// esgotaria as vagas e derrubaria o dono aos 5 min. Pelo mesmo motivo o despejo tira
// primeiro quem não é dono. Fica o resíduo: sob essa rajada, o PRIMEIRO login do dono espera.
const MAX_EM_VOO = 4;

export class SessaoPainel {
  constructor({ identificar, proprietarioId, agora = Date.now }) {
    this.identificar = identificar;
    this.proprietarioId = String(proprietarioId ?? '');
    this.agora = agora;
    this.guardadas = new Map();
    this.emVoo = new Map();
  }

  // Selo e diário de conversas: no máximo 60 s de idade.
  async ler(cabecalhoCookie) {
    return this.#resolver(cabecalhoCookie, false);
  }

  // Portão da borda: `dono` de até 5 min passa, revalidando ao fundo.
  async lerParaEntrada(cabecalhoCookie) {
    return this.#resolver(cabecalhoCookie, true);
  }

  async #resolver(cabecalhoCookie, tolerarVelha) {
    const cookie = situacaoDoCookie(cabecalhoCookie);
    if (!cookie.token) return { estado: cookie.ambiguo ? 'cookie-ambiguo' : 'sem-sessao' };
    const chave = createHash('sha256').update(cookie.token).digest('hex');
    const g = this.guardadas.get(chave);
    const idade = g ? this.agora() - g.em : -1;
    if (g && idade >= 0 && idade < FRESCA_MS) return this.#usar(chave, g);
    if (tolerarVelha && g && g.valor.estado === 'dono' && idade >= FRESCA_MS && idade < TOLERADA_MS) {
      // Falha da revalidação não derruba ninguém: a entrada velha morre sozinha aos 5 min.
      this.#verificar(chave, cookie.token).catch(() => {});
      return this.#usar(chave, g);
    }
    return this.#verificar(chave, cookie.token);
  }

  // Reinsere no fim: o despejo tira a menos usada, não a mais antiga (que seria a do dono).
  #usar(chave, g) {
    this.guardadas.delete(chave);
    this.guardadas.set(chave, g);
    return g.valor;
  }

  // Uma verificação por cookie de cada vez; quem chega durante ela espera a mesma.
  #verificar(chave, token) {
    const andando = this.emVoo.get(chave);
    if (andando) return andando;
    const jaDono = this.guardadas.get(chave)?.valor.estado === 'dono';
    if (!jaDono && this.emVoo.size >= MAX_EM_VOO) return Promise.resolve({ estado: 'indisponivel' });
    const promessa = this.#consultar(chave, token).finally(() => this.emVoo.delete(chave));
    this.emVoo.set(chave, promessa);
    return promessa;
  }

  async #consultar(chave, token) {
    const inicio = this.agora();
    let valor;
    try {
      const u = await this.identificar(token);
      valor = { estado: u.id === this.proprietarioId ? 'dono' : 'outra-conta', nome: u.nome, email: u.email };
    } catch (erro) {
      // Indisponível (ou qualquer falha que não seja o "não" do central) não fica guardado.
      if (!(erro instanceof ErroAcesso) || erro.status !== 401) return { estado: 'indisponivel' };
      valor = { estado: 'expirada' };
    }
    this.guardadas.delete(chave);
    if (this.guardadas.size >= MAX_GUARDADAS) this.#despejar();
    this.guardadas.set(chave, { em: inicio, valor });
    return valor;
  }

  // A menos usada que NÃO é do dono; só entre donos (que é um só) vale a ordem pura.
  #despejar() {
    for (const [k, g] of this.guardadas) if (g.valor.estado !== 'dono') { this.guardadas.delete(k); return; }
    this.guardadas.delete(this.guardadas.keys().next().value);
  }
}
