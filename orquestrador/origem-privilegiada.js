// Recusa POST privilegiado que não venha da própria borda. Não olha o cookie.

import { ErroAcesso } from './erro-acesso.js';

const ORIGEM = 'https://painel.vpn.astargne.com';

export class OrigemPrivilegiada {
  recusar(req, tiposConteudo = /^application\/json(?:\s*;|$)/i) {
    if (req.headers.host !== 'painel.vpn.astargne.com' || req.headers.origin !== ORIGEM ||
        req.headers['sec-fetch-site'] !== 'same-origin') return new ErroAcesso('origem privilegiada recusada', 403);
    if (!tiposConteudo.test(req.headers['content-type'] ?? '')) return new ErroAcesso('tipo de conteúdo recusado', 415);
    return null;
  }
}

export function recusaOrigemPrivilegiada(req, tiposConteudo) {
  return new OrigemPrivilegiada().recusar(req, tiposConteudo);
}
