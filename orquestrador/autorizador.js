// Autoriza uma ação privilegiada: origem, cookie, sessão e dono. Sem cache.

import { createHash } from 'node:crypto';
import { ErroAcesso } from './erro-acesso.js';
import { extrairSessao } from './sessao-cookie.js';
import { recusaOrigemPrivilegiada } from './origem-privilegiada.js';

export class Autorizador {
  constructor({ verificar, proprietarioId, tiposConteudo }) {
    this.verificar = verificar;
    this.proprietarioId = proprietarioId;
    this.tiposConteudo = tiposConteudo;
  }

  async autorizar(req) {
    const recusa = recusaOrigemPrivilegiada(req, this.tiposConteudo);
    if (recusa) throw recusa;
    if (!/^[1-9]\d{0,9}$/.test(String(this.proprietarioId ?? ''))) throw new ErroAcesso('ação privilegiada não configurada', 503);
    const token = extrairSessao(req.headers.cookie);
    if (!token) throw new ErroAcesso('entre no Cadastro Único para confirmar esta ação', 401);
    const usuarioId = await this.verificar(token);
    if (usuarioId !== String(this.proprietarioId)) throw new ErroAcesso('esta sessão do Cadastro Único não é a do dono; troque de conta em https://astargne.com e volte a esta aba', 403);
    return { usuarioId, sessaoHash: createHash('sha256').update(token).digest('hex') };
  }
}

export function criarAutorizador({ verificar, proprietarioId, tiposConteudo } = {}) {
  const autorizador = new Autorizador({ verificar, proprietarioId, tiposConteudo });
  return req => autorizador.autorizar(req);
}
