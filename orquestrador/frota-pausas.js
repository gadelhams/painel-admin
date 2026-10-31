// Pausas da frota: por provedor (limite de uso, com prazo) e da versão inteira (CLI ou modelo impedido). Não despacha.
//
// As pausas são globais, não por projeto (J6): o limite de uso de um provedor vale
// para todos os projetos, e uma CLI ou um modelo que não roda trava a versão da
// frota até o dono confirmar outra. Arquivo ilegível conta como pausado.
// A pausa de versão tem bloco (J61, F3 de 31/10/2026): `versao` é a do executor e
// `versaoZelador` a do zelador — a CLI do zelador que não roda não para o despacho, e
// vice-versa. O limite de uso continua por provedor, para os dois blocos.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Causas de `impedido` que são da frota, não da carta: não gastam tentativa da carta
// nem o teto diário da vigília.
export const CAUSAS_DA_FROTA = new Set(['cli', 'limite']);

export class PausasFrota {
  constructor({ diretorio, agora = Date.now }) {
    this.arquivo = path.join(diretorio, 'frota-pausas.json');
    this.diretorio = diretorio;
    this.agora = agora;
  }

  // Forma inválida conta como ilegível (J-H): uma pausa que não se entende não pode
  // deixar a vigília rodar.
  static formaValida(d) {
    const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    if (!objeto(d) || Object.keys(d).some(k => !['provedores', 'versao', 'versaoZelador'].includes(k)) || !objeto(d.provedores)) return false;
    if (Object.values(d.provedores).some(p => !objeto(p) || !Number.isFinite(Date.parse(p.ate)) || typeof p.motivo !== 'string')) return false;
    const versaoOk = (v, bloco) => v === null || v === undefined || (objeto(v) && Number.isInteger(v.versao) && /^[0-9a-f]{64}$/.test(v.hash ?? '')
      && typeof v.motivo === 'string' && (v.bloco === undefined || v.bloco === bloco));
    return d.versao !== undefined && versaoOk(d.versao, 'executor') && versaoOk(d.versaoZelador, 'zelador');
  }

  async ler() {
    let dados;
    try { dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8')); }
    catch (e) {
      if (e.code === 'ENOENT') return { legivel: true, provedores: {}, versao: null, versaoZelador: null };
      return { legivel: false, provedores: {}, versao: null, versaoZelador: null };
    }
    if (!PausasFrota.formaValida(dados)) return { legivel: false, provedores: {}, versao: null, versaoZelador: null };
    return { legivel: true, provedores: dados.provedores, versao: dados.versao, versaoZelador: dados.versaoZelador ?? null };
  }

  // Na confirmação de uma frota nova (sob a trava): a pausa de versão some e um arquivo
  // ilegível é regravado vazio — a saída explícita do J-H. `nota` vai para o histórico.
  static troca(atual) {
    if (!atual.legivel) return { nota: 'pausas ilegíveis regravadas vazias', novo: { provedores: {}, versao: null, versaoZelador: null } };
    const limpas = [atual.versao && `pausa da v${atual.versao.versao} limpa`, atual.versaoZelador && `pausa do zelador na v${atual.versaoZelador.versao} limpa`].filter(Boolean);
    if (limpas.length) return { nota: limpas.join('; '), novo: { provedores: atual.provedores, versao: null, versaoZelador: null } };
    return null;
  }

  async gravar(dados) {
    await fs.mkdir(this.diretorio, { recursive: true });
    const temporario = `${this.arquivo}.${randomUUID()}.tmp`;
    await fs.writeFile(temporario, JSON.stringify(dados), { flag: 'wx' });
    await fs.rename(temporario, this.arquivo);
  }

  async pausarProvedor(provedor, minutos, motivo) {
    const atual = await this.ler();
    const ate = new Date(this.agora() + minutos * 60_000).toISOString();
    await this.gravar({ provedores: { ...atual.provedores, [provedor]: { ate, motivo } }, versao: atual.versao, versaoZelador: atual.versaoZelador });
    return ate;
  }

  async pausarVersao(frota, motivo, bloco = 'executor') {
    const atual = await this.ler();
    const pausa = { versao: frota.versao, hash: frota.hash, motivo, desde: new Date(this.agora()).toISOString(), bloco };
    await this.gravar({ provedores: atual.provedores, versao: bloco === 'zelador' ? atual.versao : pausa,
      versaoZelador: bloco === 'zelador' ? pausa : atual.versaoZelador });
  }

  // Motivo que impede a frota congelada de rodar agora, ou null. `bloco` escolhe qual pausa de versão vale.
  impedimento(pausas, congelada, bloco = 'executor') {
    if (!pausas.legivel) return 'pausas da frota ilegíveis';
    const versao = bloco === 'zelador' ? pausas.versaoZelador : pausas.versao;
    if (versao && versao.versao === congelada.versao && versao.hash === congelada.hash) {
      return `${bloco === 'zelador' ? `zelador da frota v${congelada.versao} pausado` : `frota v${congelada.versao} pausada`}: ${versao.motivo}; confirme outra versão para retomar`;
    }
    for (const provedor of new Set(Object.values(congelada.tuplas).map(t => t.provedor))) {
      const p = pausas.provedores[provedor];
      if (p && Date.parse(p.ate) > this.agora()) return `provedor ${provedor} pausado até ${p.ate}: ${p.motivo}`;
    }
    return null;
  }
}
