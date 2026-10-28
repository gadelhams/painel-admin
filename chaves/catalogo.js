// O que cada projeto guarda e onde. Só nomes: o valor nunca mora aqui.

import os from 'node:os';
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '..', '..');
export const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');
export const DESTINO_SSH = 'linuxuser@astargne.com';
export const NOME = /^[A-Z_][A-Z0-9_]*$/;
export const UNIT = /^[a-z0-9][a-z0-9-]*$/;
export const ARQUIVO_SERVIDOR = /^\/opt\/[a-z0-9-]+(\/[a-z0-9_.-]+)*\/[a-z0-9_.-]*\.env$/;
export const TIMEOUT_TROCA_MS = 180_000;

// `rotacao` nomeia o card que pediu a troca e a data a partir da qual um evento a satisfaz.
// `descobrir` lista também os nomes que o arquivo tiver além dos catalogados. `foraDoEnv`
// é segredo que o painel não troca. `bloqueado` é catalogado e visível, mas não trocável.
// `depois` fora de `rotacao` é o passo obrigatório após qualquer troca. `servidor.aviso`
// nomeia o que o restart derruba. Nome descoberto só aparece no inventário.
export const CATALOGO = Object.freeze([
  { projeto: 'painel-admin', local: { arquivo: 'painel-admin/.env', unit: 'painel-admin' }, chaves: [
    { nome: 'ELEVENLABS_API_KEY', descricao: 'voz do C-3PO (ElevenLabs)' },
    { nome: 'XAI_API_KEY', descricao: 'transcrição de voz (xAI) na aba Orquestração' },
    { nome: 'PLANE_API_KEY', descricao: 'leitura do Plane, usuário Guest "painel"' },
    { nome: 'PLANE_ORQ_WRITE_KEY', descricao: 'identidade técnica do Orquestrador no CKBL' },
    { nome: 'PLANE_ORQ_PLAYER_WRITE_KEY', descricao: 'identidade técnica do Orquestrador no PLAYER' },
  ] },
  { projeto: 'alexa youtube', local: { arquivo: 'alexa youtube/.env.stream-proxy', unit: 'alexa-stream-proxy', descobrir: true }, chaves: [
    { nome: 'STREAM_PROXY_SECRET', descricao: 'token do proxy de áudio (vai na query; o journal do Caddy o grava)',
      rotacao: { pendente: true, desde: '2026-10-02', card: 'ALEXA-11', motivo: 'token gravado em claro no journal do Caddy do servidor', depois: 'nada mais desde 24/10/2026: skill e proxy são o mesmo processo no Omarchy e o Caddy já filtra o token do log' } },
    { nome: 'YOUTUBE_MUSIC_COOKIE', descricao: 'cookie da conta YouTube Music usada pelo proxy' },
  ] },
  { projeto: 'ProjetoConversaComDeus', local: { arquivo: 'ProjetoConversaComDeus/filosofia/.env', descobrir: true },
    servidor: { candidatos: ['/opt/filosofia/.env'], unit: 'filosofia', aviso: 'docker compose down/up: conversas em andamento (SSE) caem; pode levar mais de 15 s' }, chaves: [
      { nome: 'ANTHROPIC_API_KEY', descricao: 'Claude do livro de diálogos',
        rotacao: { pendente: true, desde: '2026-09-30', card: 'FILO-9', motivo: 'ficou exposta no OneDrive antes da migração', depois: 'revogar a antiga no console da Anthropic' } },
      { nome: 'GEMINI_API_KEY', descricao: 'Gemini (se ainda em uso)',
        rotacao: { pendente: true, desde: '2026-09-30', card: 'FILO-9', motivo: 'ficou exposta no OneDrive antes da migração', depois: 'revogar a antiga no Google AI Studio' } },
      { nome: 'SSO_TOKEN_INTERNO', descricao: 'token interno do Cadastro Único (nasce lá; trocar junto com o central)', bloqueado: 'troca encadeada com o TOKEN_INTERNO do central — fora do painel até existir aceitação de dois tokens' },
      { nome: 'ADMIN_PASSWORD', descricao: 'senha do admin local do livro' },
    ] },
  { projeto: 'CadastroUnico', local: { arquivo: 'CadastroUnico/.env' },
    servidor: { candidatos: ['/opt/conta-astargne/.env', '/opt/conta-astargne/current/.env'], unit: 'conta-astargne', aviso: '1 a 3 s de queda da raiz astargne.com, do player e do fliperama' }, chaves: [
      { nome: 'TOKEN_INTERNO', descricao: 'bearer das rotas /interno/* — nunca sai do servidor',
        bloqueado: 'trocar aqui derruba player (503) e fliperama até alguém rodar o instalador do EmuladorWeb; só com troca encadeada ou aceitação de dois tokens no central' },
      { nome: 'BREVO_API_KEY', descricao: 'e-mail transacional (convites, redefinição de senha)',
        rotacao: { pendente: true, desde: '2026-09-30', card: 'CAD-18', motivo: 'colada num chat em 09/2026', depois: 'revogar a antiga no painel da Brevo' } },
    ] },
  { projeto: 'PlayerForM3UList', local: { arquivo: 'PlayerForM3UList/server/.env' },
    servidor: { candidatos: ['/opt/player-for-m3u-list/current/.env', '/opt/player-for-m3u-list/current/server/.env', '/opt/player-for-m3u-list/.env'], unit: 'player-for-m3u-list',
      aviso: 'streams em andamento (/api/proxy) cortam; o deploy do player RECRIA o server/.env a partir do .env local desta máquina — toda troca no servidor precisa da mesma troca aqui, senão o próximo deploy a reverte em silêncio' }, chaves: [
      { nome: 'SSO_INTERNAL_TOKEN', descricao: 'token interno do Cadastro Único (nasce lá)', bloqueado: 'copiado do central pelo deploy; muda só junto com o TOKEN_INTERNO' },
      { nome: 'DATABASE_URL', descricao: 'Postgres do player (senha embutida na URL)',
        depois: 'ALTER USER com a mesma senha no Postgres do container player-m3u-postgres (senão o pool falha e o player cai) e a mesma troca no server/.env local, senão o próximo deploy reverte' },
    ], foraDoEnv: [
      { nome: 'credencial do provedor IPTV (na URL da playlist)', descricao: 'vive na playlist cadastrada no app, não em .env',
        rotacao: { pendente: true, desde: '2026-09-12', card: 'PLAYER-16', motivo: 'exposta na internet entre 11 e 12/09/2026', depois: 'trocar a senha no provedor e recadastrar a playlist no app' } },
    ] },
  // Sem .env: o token vive cru em /opt/emuladorweb/secrets/sso-internal-token e só muda pelo instalador.
  { projeto: 'EmuladorWeb', foraDoEnv: [
    { nome: 'SSO_INTERNAL_TOKEN (arquivo secrets/sso-internal-token)', descricao: 'token interno do Cadastro Único; troca só pelo instalador do EmuladorWeb, junto com o central' },
  ] },
  { projeto: 'RagPTdoZero', servidor: { candidatos: ['/opt/ragpt/.env'], unit: 'ragpt', descobrir: true, aviso: 'docker compose down/up: login/char/map e MariaDB reiniciam — jogadores desconectados' }, chaves: [] },
  { projeto: 'Anya', servidor: { candidatos: ['/opt/anya/instancia/segredos.env'], unit: 'anya', descobrir: true, aviso: 'reinício da Anya' }, chaves: [] },
]);

export function validarCatalogo(catalogo = CATALOGO) {
  const erros = [];
  for (const p of catalogo) {
    if (!p.local && !p.servidor && !(p.foraDoEnv?.length)) erros.push(`${p.projeto}: sem local, servidor nem segredo fora do .env`);
    if (p.local && (path.isAbsolute(p.local.arquivo) || p.local.arquivo.includes('..'))) erros.push(`${p.projeto}: arquivo local deve ser relativo à raiz`);
    if (p.local?.unit && !UNIT.test(p.local.unit)) erros.push(`${p.projeto}: unit local inválida`);
    if (p.servidor) {
      if (!UNIT.test(p.servidor.unit ?? '')) erros.push(`${p.projeto}: unit do servidor inválida`);
      for (const c of p.servidor.candidatos ?? []) if (!ARQUIVO_SERVIDOR.test(c)) erros.push(`${p.projeto}: caminho do servidor fora do padrão: ${c}`);
    }
    for (const c of p.chaves ?? []) {
      if (!NOME.test(c.nome)) erros.push(`${p.projeto}: nome inválido ${c.nome}`);
      if (c.rotacao && (!c.rotacao.card || !/^\d{4}-\d{2}-\d{2}$/.test(c.rotacao.desde ?? ''))) erros.push(`${p.projeto}/${c.nome}: rotação sem card ou data`);
    }
  }
  return erros;
}

export function nomesDoTexto(texto) {
  return texto.split('\n').map(l => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(l)?.[1]).filter(Boolean);
}
