// Inventário local: nomes, modo e rotação. Não lê o servidor e não grava valor.

import fs from 'node:fs/promises';
import path from 'node:path';
import { nomesDoTexto } from './catalogo.js';

export class InventarioLocal {
  constructor({ catalogo, raiz, diario, agora, escritaServidorHabilitada, cache }) {
    this.catalogo = catalogo;
    this.raiz = raiz;
    this.diario = diario;
    this.agora = agora;
    this.escritaServidorHabilitada = escritaServidorHabilitada;
    this.cache = cache;
  }

  caminho(p) {
    return path.join(this.raiz, p.local.arquivo);
  }

  pendencia(chave, projeto, historico) {
    const r = chave.rotacao;
    if (!r?.pendente) return null;
    const feita = historico.some(e => e.tipo === 'ROTACIONADA' && e.projeto === projeto && e.nome === chave.nome && e.quando >= `${r.desde}T00:00:00Z`);
    return feita ? null : { card: r.card, motivo: r.motivo, depois: r.depois ?? null, desde: r.desde };
  }

  async ler() {
    const historico = await this.diario.ler();
    const projetos = [];
    for (const p of this.catalogo) {
      let local = null;
      if (p.local) {
        try {
          const texto = await fs.readFile(this.caminho(p), 'utf8');
          const modo = (await fs.stat(this.caminho(p))).mode & 0o777;
          local = { arquivo: p.local.arquivo, unit: p.local.unit ?? null, existe: true, modo: modo.toString(8), nomes: nomesDoTexto(texto), permissaoFrouxa: (modo & 0o077) !== 0 };
        } catch (e) { local = { arquivo: p.local.arquivo, unit: p.local.unit ?? null, existe: false, motivo: e.code === 'ENOENT' ? 'arquivo ausente' : 'ilegível', nomes: [] }; }
      }
      const servidor = p.servidor ? { unit: p.servidor.unit, candidatos: p.servidor.candidatos, aviso: p.servidor.aviso ?? null,
        ...(this.cache.atual?.arquivos?.[p.projeto] ?? { lido: false }) } : null;
      const chaves = (p.chaves ?? []).map(c => ({ nome: c.nome, descricao: c.descricao ?? '', bloqueado: c.bloqueado ?? null, depois: c.depois ?? null,
        local: local ? (local.nomes.includes(c.nome) ? 'presente' : 'ausente') : null,
        servidor: servidor ? (servidor.lido ? (servidor.nomes?.includes(c.nome) ? 'presente' : 'ausente') : 'não lido') : null,
        rotacao: this.pendencia(c, p.projeto, historico),
        ultimaTroca: historico.filter(e => e.tipo === 'ROTACIONADA' && e.projeto === p.projeto && e.nome === c.nome).at(-1)?.quando ?? null }));
      const catalogados = new Set(chaves.map(c => c.nome));
      const extras = [...new Set([...(p.local?.descobrir ? local?.nomes ?? [] : []), ...(p.servidor?.descobrir ? servidor?.nomes ?? [] : [])])].filter(n => !catalogados.has(n));
      projetos.push({ projeto: p.projeto, local, servidor, chaves, extras,
        foraDoEnv: (p.foraDoEnv ?? []).map(c => ({ nome: c.nome, descricao: c.descricao ?? '', rotacao: this.pendencia(c, p.projeto, historico),
          ultimaTroca: historico.filter(e => e.tipo === 'ROTACIONADA' && e.projeto === p.projeto && e.nome === c.nome).at(-1)?.quando ?? null })) });
    }
    return { atualizadoEm: new Date(this.agora()).toISOString(), escritaServidorHabilitada: this.escritaServidorHabilitada, servidorLidoEm: this.cache.atual?.quando ?? null,
      pendentes: projetos.flatMap(p => [...p.chaves, ...p.foraDoEnv].filter(c => c.rotacao).map(c => ({ projeto: p.projeto, nome: c.nome, ...c.rotacao }))),
      rotacoesFeitas: this.catalogo.flatMap(p => [...(p.chaves ?? []), ...(p.foraDoEnv ?? [])].filter(c => c.rotacao?.pendente && !this.pendencia(c, p.projeto, historico))
        .map(c => ({ projeto: p.projeto, nome: c.nome, card: c.rotacao.card, quando: historico.filter(e => e.tipo === 'ROTACIONADA' && e.projeto === p.projeto && e.nome === c.nome).at(-1)?.quando ?? null }))),
      projetos, eventos: historico.slice(-20).reverse(),
      observacao: 'Só nomes de variáveis saem do servidor; valores só entram pela confirmação e nunca ficam em log.' };
  }
}
