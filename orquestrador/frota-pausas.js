// Pausas da frota: por provedor (limite de uso, com prazo) e da versão inteira (CLI ou modelo impedido). Não despacha.
//
// As pausas são globais, não por projeto (J6): o limite de uso de um provedor vale
// para todos os projetos, e uma CLI ou um modelo que não roda trava a versão da
// frota até o dono confirmar outra. Arquivo ilegível conta como pausado.
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
    if (!objeto(d) || Object.keys(d).some(k => !['provedores', 'versao'].includes(k)) || !objeto(d.provedores)) return false;
    if (Object.values(d.provedores).some(p => !objeto(p) || !Number.isFinite(Date.parse(p.ate)) || typeof p.motivo !== 'string')) return false;
    return d.versao === null || (objeto(d.versao) && Number.isInteger(d.versao.versao) && /^[0-9a-f]{64}$/.test(d.versao.hash ?? '') && typeof d.versao.motivo === 'string');
  }

  async ler() {
    let dados;
    try { dados = JSON.parse(await fs.readFile(this.arquivo, 'utf8')); }
    catch (e) {
      if (e.code === 'ENOENT') return { legivel: true, provedores: {}, versao: null };
      return { legivel: false, provedores: {}, versao: null };
    }
    if (!PausasFrota.formaValida(dados)) return { legivel: false, provedores: {}, versao: null };
    return { legivel: true, provedores: dados.provedores, versao: dados.versao };
  }

  // Na confirmação de uma frota nova (sob a trava): a pausa de versão some e um arquivo
  // ilegível é regravado vazio — a saída explícita do J-H. `nota` vai para o histórico.
  static troca(atual) {
    if (!atual.legivel) return { nota: 'pausas ilegíveis regravadas vazias', novo: { provedores: {}, versao: null } };
    if (atual.versao) return { nota: `pausa da v${atual.versao.versao} limpa`, novo: { provedores: atual.provedores, versao: null } };
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
    await this.gravar({ provedores: { ...atual.provedores, [provedor]: { ate, motivo } }, versao: atual.versao });
    return ate;
  }

  async pausarVersao(frota, motivo) {
    const atual = await this.ler();
    await this.gravar({ provedores: atual.provedores, versao: { versao: frota.versao, hash: frota.hash, motivo, desde: new Date(this.agora()).toISOString() } });
  }

  // Motivo que impede a frota congelada de rodar agora, ou null.
  impedimento(pausas, congelada) {
    if (!pausas.legivel) return 'pausas da frota ilegíveis';
    if (pausas.versao && pausas.versao.versao === congelada.versao && pausas.versao.hash === congelada.hash) {
      return `frota v${congelada.versao} pausada: ${pausas.versao.motivo}; confirme outra versão para retomar`;
    }
    for (const provedor of new Set(Object.values(congelada.tuplas).map(t => t.provedor))) {
      const p = pausas.provedores[provedor];
      if (p && Date.parse(p.ate) > this.agora()) return `provedor ${provedor} pausado até ${p.ate}: ${p.motivo}`;
    }
    return null;
  }
}
