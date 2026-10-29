// Frota: a configuração geral de modelos por papel, num arquivo só, gravado por SSO + duas ações. Não despacha nem escolhe carta.
//
// A leitura sempre devolve um estado explícito (ok | ausente | ilegivel | invalida) e
// nunca cai para padrão nenhum (J5): com estado ≠ ok, despacho e vigília param. Nada
// aqui semeia o arquivo; ele só nasce pela troca confirmada pelo dono.
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { anexarJsonl, lerJsonl } from './leitor-jsonl.js';
import { validarBlocoExecutor, validarBlocoZelador, validarConteudoFrota } from './frota-catalogo.js';

const FORMATO = 'frota/v1';
const CAMPOS = ['atualizadoEm', 'atualizadoPor', 'conteudo', 'formato', 'hash', 'versao'];

const canonico = valor => (Array.isArray(valor) ? `[${valor.map(canonico).join(',')}]`
  : valor && typeof valor === 'object' ? `{${Object.keys(valor).sort().map(k => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`
    : JSON.stringify(valor));
const sha = texto => createHash('sha256').update(texto).digest('hex');
export const hashConteudo = conteudo => sha(canonico(conteudo));

function recusa(mensagem) { const e = new Error(mensagem); e.semEscrita = true; return e; }

export class ArquivoFrota {
  constructor({ diretorio, agora = Date.now, renomear = fs.rename }) {
    if (!diretorio) throw new Error('diretório da frota obrigatório');
    this.diretorio = diretorio;
    this.arquivo = path.join(diretorio, 'frota.json');
    this.historico = path.join(diretorio, 'frota-historico.jsonl');
    // Piso da numeração, à parte do histórico e da frota: se os dois estragarem, a
    // versão nova ainda não regride.
    this.piso = path.join(diretorio, 'frota-versao.json');
    this.agora = agora;
    this.renomear = renomear;
  }

  // `marca` identifica o que foi visto; é a versão-base do preparar (J4). Para os
  // estados ruins, o digest dos bytes distingue um lixo de outro sem interpretá-lo.
  // O estado é o do bloco executor, que despacha; o zelador tem estado próprio e uma
  // tupla dele fora do catálogo não para o executor.
  async ler() {
    let bruto;
    try { bruto = await fs.readFile(this.arquivo, 'utf8'); }
    catch (e) {
      if (e.code === 'ENOENT') return { estado: 'ausente', marca: 'ausente', motivo: 'frota nunca configurada' };
      return { estado: 'ilegivel', marca: 'ilegivel:sem-leitura', motivo: 'arquivo da frota não pôde ser lido' };
    }
    const digest = sha(bruto);
    let dados;
    try { dados = JSON.parse(bruto); }
    catch { return { estado: 'ilegivel', marca: `ilegivel:${digest}`, motivo: 'arquivo da frota não é JSON' }; }
    const invalida = motivo => ({ estado: 'invalida', marca: `invalida:${digest}`, motivo });
    if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return invalida('arquivo da frota não é um objeto');
    if (Object.keys(dados).sort().join(',') !== CAMPOS.join(',') || dados.formato !== FORMATO) return invalida('formato da frota desconhecido');
    if (!Number.isInteger(dados.versao) || dados.versao < 1) return invalida('versão da frota inválida');
    const c = dados.conteudo;
    if (!c || typeof c !== 'object' || Array.isArray(c) || Object.keys(c).sort().join(',') !== 'executor,zelador') return invalida('blocos da frota inválidos');
    if (hashConteudo(c) !== dados.hash) return invalida('hash da frota não confere com o conteúdo');
    let executor;
    try { executor = validarBlocoExecutor(c.executor); } catch (e) { return invalida(e.message); }
    let zelador = null;
    let estadoZelador = { estado: 'ok', motivo: null };
    try { zelador = validarBlocoZelador(c.zelador); } catch (e) { estadoZelador = { estado: 'invalida', motivo: e.message }; }
    return { estado: 'ok', marca: `ok:${dados.versao}:${dados.hash}`, versao: dados.versao, hash: dados.hash,
      conteudo: { executor, zelador }, zelador: estadoZelador, atualizadoEm: dados.atualizadoEm ?? null, atualizadoPor: dados.atualizadoPor ?? null };
  }

  async versoes() { return (await this.lerHistorico()).linhas; }

  async lerHistorico() {
    let texto;
    try { texto = await fs.readFile(this.historico, 'utf8'); }
    catch (e) { if (e.code === 'ENOENT') return { linhas: [], truncadaNoFim: false, truncadasNoMeio: 0 }; throw e; }
    return lerJsonl(texto, 'histórico da frota');
  }

  // Para a tela (N4a): o histórico perdeu alguma escrita interrompida?
  async saudeHistorico() {
    try { const { truncadaNoFim, truncadasNoMeio } = await this.lerHistorico(); return { legivel: true, truncadaNoFim, truncadasNoMeio }; }
    catch (e) { return { legivel: false, motivo: e.message }; }
  }

  async lerPiso() {
    try {
      const v = JSON.parse(await fs.readFile(this.piso, 'utf8'))?.versao;
      if (!Number.isInteger(v) || v < 1) throw new Error();
      return { legivel: true, versao: v };
    } catch (e) { return e.code === 'ENOENT' ? { legivel: true, versao: 0, ausente: true } : { legivel: false, versao: 0 }; }
  }

  // A versão nova é maior que tudo que alguma fonte legível já viu. Sem fonte legível
  // para uma frota que já existiu, recusa numerar em vez de recomeçar do 1 (J-I).
  async proximaVersao(atual) {
    const piso = await this.lerPiso();
    let historico = null;
    try { historico = await this.versoes(); } catch { historico = null; }
    if (!piso.legivel && historico === null) throw recusa('histórico e piso da frota ilegíveis; a versão nova não pode ser numerada');
    const doHistorico = (historico ?? []).map(l => (Number.isInteger(l.versao) ? l.versao : 0));
    const vazio = piso.ausente && (historico === null || !historico.length);
    if (vazio && ['ilegivel', 'invalida'].includes(atual.estado)) throw recusa('frota ruim sem histórico nem piso legível; a versão nova não pode ser numerada');
    return Math.max(atual.versao ?? 0, piso.versao, ...doHistorico, 0) + 1;
  }

  // Quem chama segura a trava global. A releitura aqui é a da decisão de gravar: se a
  // marca mudou desde o preparar, nada é escrito. Regravar uma frota ilegível não
  // precisa interpretar a anterior; o histórico registra o que foi substituído.
  async gravar({ conteudo, base, usuarioId, notaPausas = null }) {
    let validado;
    try { validado = validarConteudoFrota(conteudo); } catch (e) { throw recusa(e.message); }
    try {
      if (!(await fs.lstat(this.arquivo)).isFile()) throw recusa('frota.json não é um arquivo comum; conserte à mão antes de gravar');
    } catch (e) { if (e.code !== 'ENOENT') throw e.semEscrita ? e : recusa(`frota.json inacessível: ${e.code ?? e.message}`); }
    const atual = await this.ler();
    if (atual.marca !== base) throw recusa('a frota mudou desde o preparar; recarregue e prepare de novo');
    const versao = await this.proximaVersao(atual);
    const hash = hashConteudo(validado);
    const atualizadoEm = new Date(this.agora()).toISOString();
    const registro = { formato: FORMATO, versao, hash, atualizadoEm, atualizadoPor: String(usuarioId), conteudo: validado };
    await fs.mkdir(this.diretorio, { recursive: true });
    const temporario = `${this.arquivo}.${randomUUID()}.tmp`;
    const tmpPiso = `${this.piso}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporario, JSON.stringify(registro), { flag: 'wx' });
      await fs.writeFile(tmpPiso, JSON.stringify({ versao }), { flag: 'wx' });
      await fs.rename(tmpPiso, this.piso);
      // O histórico vem antes do rename: uma queda entre os dois deixa uma versão
      // registrada que nunca virou atual, nunca uma atual sem registro.
      // A perda deixa rastro no próprio histórico (N4a).
      const saude = await this.saudeHistorico();
      const cauda = !saude.legivel ? 'histórico ilegível antes desta versão'
        : saude.truncadaNoFim ? 'escrita interrompida no fim separada antes desta versão' : null;
      await anexarJsonl(this.historico, { quando: atualizadoEm, versao, hash, usuarioId: String(usuarioId), ...(cauda ? { historico: cauda } : {}),
        substituiu: atual.estado === 'ok' ? { estado: 'ok', versao: atual.versao, hash: atual.hash } : { estado: atual.estado, motivo: atual.motivo },
        ...(notaPausas ? { pausas: notaPausas } : {}), conteudo: validado });
      try { await this.renomear(temporario, this.arquivo); }
      catch (e) {
        await anexarJsonl(this.historico, { quando: atualizadoEm, versao, hash, evento: 'nunca-aplicada', motivo: e.code ?? e.message }).catch(() => {});
        throw new Error(`frota v${versao} não aplicada (${e.code ?? e.message}); registrada no histórico como nunca aplicada`);
      }
    } finally {
      await fs.rm(temporario, { force: true }).catch(() => {});
      await fs.rm(tmpPiso, { force: true }).catch(() => {});
    }
    return { estado: 'ok', marca: `ok:${versao}:${hash}`, versao, hash, conteudo: validado, atualizadoEm, atualizadoPor: String(usuarioId),
      substituiu: atual.estado };
  }
}

// O que a tentativa congela na reserva (J3): versão, hash e as três tuplas do executor.
// O bloco zelador nunca entra aqui (J8).
export function congelarFrota(frota) {
  if (frota?.estado !== 'ok') throw new Error(`frota ${frota?.estado ?? 'ausente'}: nenhum despacho nem vigília${frota?.motivo ? ` (${frota.motivo})` : ''}`);
  return Object.freeze({ versao: frota.versao, hash: frota.hash, tuplas: frota.conteudo.executor });
}
