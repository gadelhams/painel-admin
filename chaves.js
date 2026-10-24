// Tela Chaves (decisão do dono, 24/10/2026): inventário dos segredos por projeto — só
// NOMES circulam entre servidor e navegador; o valor novo viaja uma única vez, no corpo
// do "confirmar", e termina no .env (local, escrita atômica 0600; ou no servidor, pelo
// stdin de um ssh com script fixo), nunca em log, evento ou resposta. "Rotação pendente"
// vem do catálogo (o card que a pediu e a data) e some quando um evento de troca
// posterior existe. Mesma fronteira das outras ações privilegiadas: origem do painel,
// sessão do Cadastro Único e confirmação em duas ações.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn as spawnPadrao } from 'node:child_process';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { criarExecutorSsh } from './contas.js';
import { ErroAcesso } from './orquestrador/sso.js';
import { pendentes } from './orquestrador/confirmacoes.js';

const RAIZ = path.resolve(import.meta.dirname, '..'); // ProjetosPessoais/
const CHAVE_SSH = path.join(os.homedir(), '.ssh', 'paroquia-vultr');
const DESTINO_SSH = 'linuxuser@astargne.com';
const NOME = /^[A-Z_][A-Z0-9_]*$/;
const UNIT = /^[a-z0-9][a-z0-9-]*$/;
const ARQUIVO_SERVIDOR = /^\/opt\/[a-z0-9-]+(\/[a-z0-9_.-]+)*\/[a-z0-9_.-]*\.env$/;

// Catálogo: o que cada projeto guarda e onde. `rotacao` nomeia o card que pediu a troca e
// a data a partir da qual um evento de troca a satisfaz; `descobrir` lista também os nomes
// que o arquivo tiver além dos catalogados. `foraDoEnv` é segredo que o painel não troca
// (vive no provedor ou na base), só registra a rotação quando o dono a fizer.
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
      rotacao: { pendente: true, desde: '2026-10-02', card: 'ALEXA-11', motivo: 'token gravado em claro no journal do Caddy do servidor', depois: 'trocar o mesmo valor na skill da Alexa (Lambda) e filtrar o log do Caddy' } },
    { nome: 'YOUTUBE_MUSIC_COOKIE', descricao: 'cookie da conta YouTube Music usada pelo proxy' },
  ] },
  { projeto: 'ProjetoConversaComDeus', local: { arquivo: 'ProjetoConversaComDeus/filosofia/.env', descobrir: true },
    servidor: { candidatos: ['/opt/filosofia/.env'], unit: 'filosofia' }, chaves: [
      { nome: 'ANTHROPIC_API_KEY', descricao: 'Claude do livro de diálogos',
        rotacao: { pendente: true, desde: '2026-09-30', card: 'FILO-9', motivo: 'ficou exposta no OneDrive antes da migração', depois: 'revogar a antiga no console da Anthropic' } },
      { nome: 'GEMINI_API_KEY', descricao: 'Gemini (se ainda em uso)',
        rotacao: { pendente: true, desde: '2026-09-30', card: 'FILO-9', motivo: 'ficou exposta no OneDrive antes da migração', depois: 'revogar a antiga no Google AI Studio' } },
      { nome: 'SSO_TOKEN_INTERNO', descricao: 'token interno do Cadastro Único (nasce lá; trocar junto com o central)' },
      { nome: 'ADMIN_PASSWORD', descricao: 'senha do admin local do livro' },
    ] },
  { projeto: 'CadastroUnico', local: { arquivo: 'CadastroUnico/.env' },
    servidor: { candidatos: ['/opt/conta-astargne/.env', '/opt/conta-astargne/current/.env'], unit: 'conta-astargne' }, chaves: [
      { nome: 'TOKEN_INTERNO', descricao: 'bearer das rotas /interno/* — nunca sai do servidor; trocar exige trocar SSO_*TOKEN* em filosofia, player e emulador na mesma janela' },
      { nome: 'BREVO_API_KEY', descricao: 'e-mail transacional (convites, redefinição de senha)',
        rotacao: { pendente: true, desde: '2026-09-30', card: 'CAD-18', motivo: 'colada num chat em 09/2026', depois: 'revogar a antiga no painel da Brevo' } },
    ] },
  { projeto: 'PlayerForM3UList', local: { arquivo: 'PlayerForM3UList/server/.env' },
    servidor: { candidatos: ['/opt/player-for-m3u-list/current/.env', '/opt/player-for-m3u-list/current/server/.env', '/opt/player-for-m3u-list/.env'], unit: 'player-for-m3u-list' }, chaves: [
      { nome: 'SSO_INTERNAL_TOKEN', descricao: 'token interno do Cadastro Único (nasce lá)' },
      { nome: 'DATABASE_URL', descricao: 'Postgres do player (senha embutida na URL)' },
    ], foraDoEnv: [
      { nome: 'credencial do provedor IPTV (na URL da playlist)', descricao: 'vive na playlist cadastrada no app, não em .env',
        rotacao: { pendente: true, desde: '2026-09-12', card: 'PLAYER-16', motivo: 'exposta na internet entre 11 e 12/09/2026', depois: 'trocar a senha no provedor e recadastrar a playlist no app' } },
    ] },
  { projeto: 'EmuladorWeb', servidor: { candidatos: ['/opt/emuladorweb/current/.env', '/opt/emuladorweb/shared/.env', '/opt/emuladorweb/.env'], unit: 'emuladorweb', descobrir: true }, chaves: [
    { nome: 'SSO_INTERNAL_TOKEN', descricao: 'token interno do Cadastro Único (nasce lá)' },
  ] },
  { projeto: 'RagPTdoZero', servidor: { candidatos: ['/opt/ragpt/.env'], unit: 'ragpt', descobrir: true }, chaves: [] },
  { projeto: 'Anya', servidor: { candidatos: ['/opt/anya/instancia/segredos.env'], unit: 'anya', descobrir: true }, chaves: [] },
]);

export function validarCatalogo(catalogo = CATALOGO) {
  const erros = [];
  for (const p of catalogo) {
    if (!p.local && !p.servidor) erros.push(`${p.projeto}: sem local nem servidor`);
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

function nomesDoTexto(texto) {
  return texto.split('\n').map(l => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(l)?.[1]).filter(Boolean);
}

export function criarServicoChaves({ catalogo = CATALOGO, raiz = RAIZ,
  diretorioEstado = path.join(os.homedir(), '.local', 'state', 'painel-admin'),
  executar = criarExecutorSsh(), spawn = spawnPadrao, agora = Date.now,
  escritaServidorHabilitada = process.env.CHAVES_SERVIDOR_ESCRITA?.trim() === 'true', log = console.error } = {}) {
  const erros = validarCatalogo(catalogo);
  if (erros.length) throw new Error(`catálogo de chaves inválido: ${erros.join('; ')}`);
  const eventos = path.join(diretorioEstado, 'chaves.jsonl');
  let inventarioServidorCache = null;

  async function lerEventos() {
    try { return (await fs.readFile(eventos, 'utf8')).split('\n').filter(Boolean).map(JSON.parse); }
    catch (e) { if (e.code === 'ENOENT') return []; throw new Error('eventos de chaves ilegíveis'); }
  }
  async function anotar(evento) {
    if ('valor' in evento) throw new Error('evento de chave nunca leva valor');
    await fs.mkdir(diretorioEstado, { recursive: true });
    await fs.appendFile(eventos, `${JSON.stringify({ quando: new Date(agora()).toISOString(), ...evento })}\n`, 'utf8');
  }
  const caminhoLocal = p => path.join(raiz, p.local.arquivo);

  function pendenciaDe(chave, projeto, historico) {
    const r = chave.rotacao;
    if (!r?.pendente) return null;
    const feita = historico.some(e => e.tipo === 'ROTACIONADA' && e.projeto === projeto && e.nome === chave.nome && e.quando >= `${r.desde}T00:00:00Z`);
    return feita ? null : { card: r.card, motivo: r.motivo, depois: r.depois ?? null, desde: r.desde };
  }

  // Inventário local: lê só os NOMES dos arquivos deste disco; servidor entra pelo cache
  // da última leitura por ssh (ou "não lido").
  async function inventario() {
    const historico = await lerEventos();
    const projetos = [];
    for (const p of catalogo) {
      let local = null;
      if (p.local) {
        try {
          const texto = await fs.readFile(caminhoLocal(p), 'utf8');
          const modo = (await fs.stat(caminhoLocal(p))).mode & 0o777;
          local = { arquivo: p.local.arquivo, unit: p.local.unit ?? null, existe: true, modo: modo.toString(8), nomes: nomesDoTexto(texto), permissaoFrouxa: (modo & 0o077) !== 0 };
        } catch (e) { local = { arquivo: p.local.arquivo, unit: p.local.unit ?? null, existe: false, motivo: e.code === 'ENOENT' ? 'arquivo ausente' : 'ilegível', nomes: [] }; }
      }
      const servidor = p.servidor ? { unit: p.servidor.unit, candidatos: p.servidor.candidatos,
        ...(inventarioServidorCache?.arquivos?.[p.projeto] ?? { lido: false }) } : null;
      const chaves = (p.chaves ?? []).map(c => ({ nome: c.nome, descricao: c.descricao ?? '',
        local: local ? (local.nomes.includes(c.nome) ? 'presente' : 'ausente') : null,
        servidor: servidor ? (servidor.lido ? (servidor.nomes?.includes(c.nome) ? 'presente' : 'ausente') : 'não lido') : null,
        rotacao: pendenciaDe(c, p.projeto, historico),
        ultimaTroca: historico.filter(e => e.tipo === 'ROTACIONADA' && e.projeto === p.projeto && e.nome === c.nome).at(-1)?.quando ?? null }));
      const catalogados = new Set(chaves.map(c => c.nome));
      const extras = [...new Set([...(p.local?.descobrir ? local?.nomes ?? [] : []), ...(p.servidor?.descobrir ? servidor?.nomes ?? [] : [])])].filter(n => !catalogados.has(n));
      projetos.push({ projeto: p.projeto, local, servidor, chaves, extras,
        foraDoEnv: (p.foraDoEnv ?? []).map(c => ({ nome: c.nome, descricao: c.descricao ?? '', rotacao: pendenciaDe(c, p.projeto, historico),
          ultimaTroca: historico.filter(e => e.tipo === 'ROTACIONADA' && e.projeto === p.projeto && e.nome === c.nome).at(-1)?.quando ?? null })) });
    }
    return { atualizadoEm: new Date(agora()).toISOString(), escritaServidorHabilitada, servidorLidoEm: inventarioServidorCache?.quando ?? null,
      pendentes: projetos.flatMap(p => [...p.chaves, ...p.foraDoEnv].filter(c => c.rotacao).map(c => ({ projeto: p.projeto, nome: c.nome, ...c.rotacao }))),
      projetos, eventos: historico.slice(-20).reverse(),
      observacao: 'Só nomes de variáveis saem do servidor; valores só entram pela confirmação e nunca ficam em log.' };
  }

  // Um ssh, script fixo construído do catálogo (nunca do navegador): existência, modo e
  // nomes de cada arquivo candidato. `sudo` porque os .env são 600 dos usuários de serviço.
  function scriptInventarioServidor() {
    const linhas = [];
    for (const p of catalogo) for (const c of p.servidor?.candidatos ?? []) {
      linhas.push(`if sudo test -f '${c}'; then echo "ARQ ${p.projeto.replace(/'/g, '')}|${c}|$(sudo stat -c %a '${c}')"; sudo grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' '${c}' | cut -d= -f1 | sed 's/^/VAR /'; fi`);
    }
    return linhas.join('; ');
  }
  async function lerServidor() {
    const r = await executar(['-i', CHAVE_SSH, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', DESTINO_SSH, scriptInventarioServidor()], '');
    if (r.codigo !== 0) throw new Error('sem acesso ao servidor');
    const arquivos = {};
    let atual = null;
    for (const linha of r.stdout.split('\n')) {
      const arq = /^ARQ ([^|]+)\|([^|]+)\|(\d+)$/.exec(linha);
      if (arq) { atual = { arquivo: arq[2], modo: arq[3], nomes: [], lido: true, permissaoFrouxa: (parseInt(arq[3], 8) & 0o077) !== 0 }; arquivos[arq[1]] = arquivos[arq[1]] ?? atual; if (arquivos[arq[1]] !== atual) atual = arquivos[arq[1]]; continue; }
      const v = /^VAR ([A-Za-z_][A-Za-z0-9_]*)$/.exec(linha);
      if (v && atual) atual.nomes.push(v[1]);
    }
    inventarioServidorCache = { quando: new Date(agora()).toISOString(), arquivos };
    return inventario();
  }

  function entrada(projeto, nome, alvo) {
    const p = catalogo.find(x => x.projeto === projeto);
    if (!p) throw new ErroAcesso('projeto fora do catálogo de chaves', 422);
    if (alvo === 'fora') {
      const c = (p.foraDoEnv ?? []).find(x => x.nome === nome);
      if (!c) throw new ErroAcesso('segredo fora do catálogo', 422);
      return { p, c, alvo };
    }
    if (!NOME.test(nome ?? '')) throw new ErroAcesso('nome de variável inválido', 422);
    const c = (p.chaves ?? []).find(x => x.nome === nome) ?? ((p[alvo]?.descobrir) ? { nome, descoberta: true } : null);
    if (!c) throw new ErroAcesso('variável fora do catálogo deste projeto', 422);
    if (alvo === 'local' && !p.local) throw new ErroAcesso('projeto sem .env local catalogado', 422);
    if (alvo === 'servidor') {
      if (!p.servidor) throw new ErroAcesso('projeto sem .env no servidor catalogado', 422);
      if (!escritaServidorHabilitada) throw new ErroAcesso('troca no servidor desligada: aguarda APROVADO do validador-deploy (CHAVES_SERVIDOR_ESCRITA)', 503);
      const lido = inventarioServidorCache?.arquivos?.[projeto];
      if (!lido?.arquivo) throw new ErroAcesso('leia o inventário do servidor antes de trocar (o arquivo real precisa ser conhecido)', 409);
    }
    return { p, c, alvo };
  }

  function validarValor(valor) {
    if (typeof valor !== 'string' || !valor.length || valor.length > 4096 || /[\r\n\0]/.test(valor)) throw new ErroAcesso('valor inválido (1 a 4096 caracteres, sem quebra de linha)', 422);
  }

  function reescrever(texto, nome, valor) {
    const linhas = texto.split('\n');
    const i = linhas.findIndex(l => l.startsWith(`${nome}=`));
    if (i >= 0) linhas[i] = `${nome}=${valor}`;
    else { if (linhas.at(-1) === '') linhas.pop(); linhas.push(`${nome}=${valor}`); }
    return `${linhas.join('\n')}\n`;
  }

  async function trocarLocal(p, nome, valor, usuarioId) {
    const arquivo = caminhoLocal(p);
    let texto = '';
    try { texto = await fs.readFile(arquivo, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const carimbo = new Date(agora()).toISOString().replace(/[:.]/g, '-');
    if (texto) await fs.copyFile(arquivo, `${arquivo}.bak-${carimbo}`).then(() => fs.chmod(`${arquivo}.bak-${carimbo}`, 0o600));
    const temporario = `${arquivo}.${randomUUID()}.tmp`;
    await fs.writeFile(temporario, reescrever(texto, nome, valor), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporario, arquivo);
    await anotar({ tipo: 'ROTACIONADA', projeto: p.projeto, nome, alvo: 'local', usuarioId, unit: p.local.unit ?? null });
    // Reinício depois da resposta: se a unit for o próprio painel, o processo morre — por
    // isso o atraso, e a resposta já diz que o serviço vai reiniciar.
    if (p.local.unit) {
      setTimeout(() => { try { spawn('systemctl', ['--user', 'restart', p.local.unit], { stdio: 'ignore', detached: true }).unref(); } catch (e) { log(`[chaves] reinício de ${p.local.unit} falhou: ${e.message}`); } }, 1000).unref?.();
    }
    return { ok: true, alvo: 'local', arquivo: p.local.arquivo, reinicia: p.local.unit ?? null };
  }

  // Script fixo no servidor: python3 (sem aspas simples dentro) recebe o VALOR pelo stdin e
  // arquivo/nome/unit como argumentos já validados por regex; cópia .bak, escrita atômica
  // com o dono e 600 originais, depois `systemctl restart` da unit do catálogo.
  const PYTHON_REMOTO = 'import sys,os,shutil,time\narq,nome=sys.argv[1],sys.argv[2]\nvalor=sys.stdin.read().rstrip("\\n")\nif not valor or "\\n" in valor or "\\r" in valor: sys.exit(97)\nst=os.stat(arq)\ntexto=open(arq,encoding="utf-8").read()\nlinhas=texto.split("\\n")\nif linhas and linhas[-1]=="": linhas.pop()\nfor i,l in enumerate(linhas):\n  if l.startswith(nome+"="): linhas[i]=nome+"="+valor; break\nelse: linhas.append(nome+"="+valor)\nshutil.copy2(arq, arq+".bak-"+time.strftime("%Y%m%d%H%M%S"))\ntmp=arq+".tmp"\nfd=os.open(tmp, os.O_WRONLY|os.O_CREAT|os.O_TRUNC, 0o600)\nos.write(fd, ("\\n".join(linhas)+"\\n").encode("utf-8"))\nos.close(fd)\nos.chown(tmp, st.st_uid, st.st_gid)\nos.chmod(tmp, 0o600)\nos.replace(tmp, arq)\nprint("OK")';
  function scriptTrocaServidor(arquivo, nome, unit) {
    if (!ARQUIVO_SERVIDOR.test(arquivo) || !NOME.test(nome) || !UNIT.test(unit)) throw new ErroAcesso('alvo do servidor inválido', 422);
    return `sudo python3 -c '${PYTHON_REMOTO}' '${arquivo}' '${nome}' && sudo systemctl restart '${unit}' && echo REINICIADO`;
  }
  async function trocarServidor(p, nome, valor, usuarioId) {
    const arquivo = inventarioServidorCache.arquivos[p.projeto].arquivo;
    const r = await executar(['-i', CHAVE_SSH, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', DESTINO_SSH, scriptTrocaServidor(arquivo, nome, p.servidor.unit)], valor);
    if (r.codigo !== 0 || !r.stdout.includes('OK')) {
      await anotar({ tipo: 'ROTACAO_INCERTA', projeto: p.projeto, nome, alvo: 'servidor', usuarioId, codigo: r.codigo });
      throw new Error('troca no servidor não confirmada; conferir o arquivo e o serviço antes de repetir');
    }
    await anotar({ tipo: 'ROTACIONADA', projeto: p.projeto, nome, alvo: 'servidor', usuarioId, unit: p.servidor.unit, reiniciado: r.stdout.includes('REINICIADO') });
    return { ok: true, alvo: 'servidor', arquivo, reiniciou: r.stdout.includes('REINICIADO') };
  }

  async function preparar({ projeto, nome, alvo }) {
    const { p, c } = entrada(projeto, nome, alvo);
    const arquivo = alvo === 'local' ? p.local.arquivo : alvo === 'servidor' ? inventarioServidorCache.arquivos[projeto].arquivo : null;
    return { projeto, nome, alvo, arquivo, unit: alvo === 'local' ? p.local.unit ?? null : alvo === 'servidor' ? p.servidor.unit : null, descricao: c.descricao ?? '',
      depois: c.rotacao?.depois ?? null,
      aviso: alvo === 'fora' ? 'Confirmar só registra que você rotacionou este segredo no provedor; nada é escrito aqui.'
        : `Confirmar grava o valor novo em ${arquivo} (cópia .bak ao lado, 600) e reinicia ${alvo === 'local' ? p.local.unit ?? 'nenhum serviço' : p.servidor.unit}. O valor não aparece em log nem resposta.` };
  }

  async function confirmar({ projeto, nome, alvo }, valor, usuarioId) {
    const { p } = entrada(projeto, nome, alvo);
    if (alvo === 'fora') {
      if (valor !== undefined) throw new ErroAcesso('segredo fora do .env não recebe valor', 422);
      await anotar({ tipo: 'ROTACIONADA', projeto, nome, alvo: 'fora', usuarioId });
      return { ok: true, alvo: 'fora' };
    }
    validarValor(valor);
    return alvo === 'local' ? trocarLocal(p, nome, valor, usuarioId) : trocarServidor(p, nome, valor, usuarioId);
  }

  return { inventario, lerServidor, preparar, confirmar, scriptInventarioServidor, scriptTrocaServidor };
}

export function criarConfirmacoesChaves({ servico, agora = () => Date.now() }) {
  const desafios = new Map();
  const limpar = () => { for (const [id, d] of desafios) if ((d.estado === 'pendente' ? d.expiraEm : d.reterAte) <= agora()) desafios.delete(id); };
  return {
    async preparar({ projeto, nome, alvo }, identidade) {
      limpar();
      if (pendentes(desafios) >= 100) throw new ErroAcesso('muitas confirmações pendentes', 429);
      if (!['local', 'servidor', 'fora'].includes(alvo) || typeof projeto !== 'string' || typeof nome !== 'string') throw new ErroAcesso('projeto, nome ou alvo inválidos', 422);
      const dados = await servico.preparar({ projeto, nome, alvo });
      const id = randomUUID();
      const expiraEm = agora() + 120_000;
      desafios.set(id, { estado: 'pendente', expiraEm, identidade, projeto, nome, alvo });
      return { confirmacaoId: id, expiraEm: new Date(expiraEm).toISOString(), ...dados };
    },
    async confirmar(id, valor, identidade) {
      const d = desafios.get(id);
      if (!d) throw new ErroAcesso('confirmação ausente ou expirada', 404);
      const a = Buffer.from(identidade.sessaoHash ?? '', 'hex');
      const b = Buffer.from(d.identidade.sessaoHash ?? '', 'hex');
      if (identidade.usuarioId !== d.identidade.usuarioId || a.length !== 32 || b.length !== 32 || !timingSafeEqual(a, b)) throw new ErroAcesso('confirmação pertence a outra sessão', 403);
      if (d.estado === 'concluida') return d.resultado;
      if (d.estado !== 'pendente') throw new ErroAcesso('confirmação já usada ou resultado incerto', 409);
      if (d.expiraEm <= agora()) { desafios.delete(id); throw new ErroAcesso('confirmação expirada', 410); }
      d.estado = 'executando';
      try {
        d.resultado = await servico.confirmar({ projeto: d.projeto, nome: d.nome, alvo: d.alvo }, valor, identidade.usuarioId);
        d.estado = 'concluida'; d.reterAte = agora() + 3_600_000;
        return d.resultado;
      } catch (erro) {
        if (erro instanceof ErroAcesso) { desafios.delete(id); throw erro; }
        d.estado = 'incerta'; d.reterAte = agora() + 3_600_000;
        throw erro;
      }
    },
  };
}

export function criarApiChaves({ autorizar, confirmacoes }) {
  return async (req, pathname, lerCorpo) => {
    if (req.method !== 'POST' || !['/api/chaves/preparar', '/api/chaves/confirmar'].includes(pathname)) return { status: 405, corpo: { erro: 'operação indisponível' } };
    let identidade;
    try { identidade = await autorizar(req); }
    catch (erro) { return { status: erro instanceof ErroAcesso ? erro.status : 502, corpo: { erro: erro instanceof ErroAcesso ? erro.message : 'verificação de sessão indisponível' } }; }
    let corpo;
    try { corpo = JSON.parse(await lerCorpo(req)); if (!corpo || Array.isArray(corpo) || typeof corpo !== 'object') throw Error(); }
    catch { return { status: 400, corpo: { erro: 'corpo JSON inválido' } }; }
    try {
      if (pathname.endsWith('/preparar')) {
        if (Object.keys(corpo).sort().join(',') !== 'alvo,nome,projeto') throw new ErroAcesso('campos de preparação inválidos', 422);
        return { status: 200, corpo: await confirmacoes.preparar(corpo, identidade) };
      }
      const campos = Object.keys(corpo).sort().join(',');
      if (campos !== 'confirmacaoId' && campos !== 'confirmacaoId,valor') throw new ErroAcesso('confirmação aceita só o identificador e o valor', 422);
      if (!/^[0-9a-f-]{36}$/i.test(corpo.confirmacaoId ?? '')) throw new ErroAcesso('confirmação inválida', 422);
      return { status: 200, corpo: await confirmacoes.confirmar(corpo.confirmacaoId, corpo.valor, identidade) };
    } catch (erro) {
      if (erro instanceof ErroAcesso) return { status: erro.status, corpo: { erro: erro.message } };
      return { status: 409, corpo: { erro: 'resultado incerto; confira o arquivo e o serviço antes de repetir' } };
    }
  };
}
