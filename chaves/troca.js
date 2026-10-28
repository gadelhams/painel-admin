// Escolhe o destino da troca. O valor entra uma vez e sai no arquivo; nunca no diário.

import path from 'node:path';
import { ErroAcesso } from '../orquestrador/sso.js';
import { NOME } from './catalogo.js';
import { TrocaLocal } from './troca-local.js';
import { TrocaServidor } from './troca-servidor.js';

export class TrocaChaves {
  constructor({ catalogo, raiz, diario, agora, escritaServidorHabilitada, trocaSsh, spawn, log, cache }) {
    this.catalogo = catalogo;
    this.raiz = raiz;
    this.diario = diario;
    this.escritaServidorHabilitada = escritaServidorHabilitada;
    this.cache = cache;
    this.local = new TrocaLocal({ raiz, diario, agora, spawn, log });
    this.servidor = new TrocaServidor({ diario, trocaSsh, cache });
  }

  caminho(p) {
    return path.join(this.raiz, p.local.arquivo);
  }

  entrada(projeto, nome, alvo) {
    const p = this.catalogo.find(x => x.projeto === projeto);
    if (!p) throw new ErroAcesso('projeto fora do catálogo de chaves', 422);
    if (alvo === 'fora') {
      const c = (p.foraDoEnv ?? []).find(x => x.nome === nome);
      if (!c) throw new ErroAcesso('segredo fora do catálogo', 422);
      return { p, c, alvo };
    }
    if (!NOME.test(nome ?? '')) throw new ErroAcesso('nome de variável inválido', 422);
    const c = (p.chaves ?? []).find(x => x.nome === nome);
    if (!c) throw new ErroAcesso((p[alvo]?.descobrir) ? 'variável descoberta, não catalogada: catalogue-a em chaves.js antes de trocar' : 'variável fora do catálogo deste projeto', 422);
    if (c.bloqueado) throw new ErroAcesso(`troca bloqueada pelo painel: ${c.bloqueado}`, 422);
    if (alvo === 'local' && !p.local) throw new ErroAcesso('projeto sem .env local catalogado', 422);
    if (alvo === 'servidor') {
      if (!p.servidor) throw new ErroAcesso('projeto sem .env no servidor catalogado', 422);
      if (!this.escritaServidorHabilitada) throw new ErroAcesso('troca no servidor desligada: aguarda APROVADO do validador-deploy (CHAVES_SERVIDOR_ESCRITA)', 503);
      const lido = this.cache.atual?.arquivos?.[projeto];
      if (!lido?.arquivo) throw new ErroAcesso('leia o inventário do servidor antes de trocar (o arquivo real precisa ser conhecido)', 409);
      if (lido.ambiguo) throw new ErroAcesso('mais de um arquivo candidato existe no servidor; resolva lá antes de trocar', 409);
    }
    return { p, c, alvo };
  }

  validarValor(valor, alvo) {
    if (typeof valor !== 'string' || !valor.length || valor.length > 4096 || /[\r\n\0]/.test(valor)) throw new ErroAcesso('valor inválido (1 a 4096 caracteres, sem quebra de linha)', 422);
    if (alvo === 'servidor' && /[\s#$'"\\]/.test(valor)) throw new ErroAcesso('valor para o servidor não pode ter espaço, #, $, aspas ou barra invertida', 422);
  }

  scriptServidor(arquivo, nome, unit) {
    return this.servidor.script(arquivo, nome, unit);
  }

  async preparar({ projeto, nome, alvo }) {
    const { p, c } = this.entrada(projeto, nome, alvo);
    const arquivo = alvo === 'local' ? p.local.arquivo : alvo === 'servidor' ? this.cache.atual.arquivos[projeto].arquivo : null;
    return { projeto, nome, alvo, arquivo, unit: alvo === 'local' ? p.local.unit ?? null : alvo === 'servidor' ? p.servidor.unit : null, descricao: c.descricao ?? '',
      depois: [c.depois, c.rotacao?.depois].filter(Boolean).join(' · ') || null,
      aviso: alvo === 'fora' ? 'Confirmar só registra que você rotacionou este segredo no provedor; nada é escrito aqui.'
        : `Confirmar grava o valor novo em ${arquivo} (cópia .bak ao lado, 600) e reinicia ${alvo === 'local' ? p.local.unit ?? 'nenhum serviço' : p.servidor.unit}.${alvo === 'servidor' && p.servidor.aviso ? ` Efeito do reinício: ${p.servidor.aviso}.` : ''} O valor não aparece em log nem resposta.` };
  }

  async confirmar({ projeto, nome, alvo }, valor, usuarioId) {
    const { p } = this.entrada(projeto, nome, alvo);
    if (alvo === 'fora') {
      if (valor !== undefined) throw new ErroAcesso('segredo fora do .env não recebe valor', 422);
      await this.diario.anotar({ tipo: 'ROTACIONADA', projeto, nome, alvo: 'fora', usuarioId });
      return { ok: true, alvo: 'fora' };
    }
    this.validarValor(valor, alvo);
    return alvo === 'local' ? this.local.aplicar(p, nome, valor, usuarioId) : this.servidor.aplicar(p, nome, valor, usuarioId);
  }
}
