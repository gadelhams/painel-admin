// Texto HANDOFF: valida a entrada, codifica o comentário (v2) e lê o card (v1 legado e v2).
//
// v2 (29/10/2026, F2 da frota) torna `origemModelos` obrigatório: `frota` (versão, hash e
// as três tuplas que rodaram) ou `humano` (handoff registrado à mão pelo dono). Um campo
// novo obrigatório no v1 tornaria inválidos os recibos antigos; por isso a versão sobe e
// o v1 continua legível, com origem `perfil-ia`.

import { UUID } from './uuid.js';
import { PAPEIS_EXECUTOR, validarBlocoExecutor } from './frota-catalogo.js';
const MARCADOR_V1 = 'HANDOFF/v1 ';
const MARCADOR = 'HANDOFF/v2 ';
const PAPEIS = new Set(['orquestracao', 'desenvolvedor', 'validador']);
const RESULTADOS = new Set(['proposta', 'em_andamento', 'concluido', 'impedido', 'rejeitado']);
const escapar = valor => String(valor).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const NOME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

// Só a forma (correção J-G): um recibo gravado com o catálogo de ontem continua legível
// depois que o catálogo muda. O catálogo vale na escrita.
function formaDasTuplas(tuplas) {
  const objeto = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  if (!objeto(tuplas) || Object.keys(tuplas).sort().join(',') !== [...PAPEIS_EXECUTOR].sort().join(',')) throw new Error('tuplas da origem dos modelos inválidas');
  for (const t of Object.values(tuplas)) {
    if (!objeto(t) || Object.keys(t).sort().join(',') !== 'esforco,modelo,provedor' || ![t.provedor, t.modelo, t.esforco].every(v => NOME.test(v ?? ''))) {
      throw new Error('tuplas da origem dos modelos inválidas');
    }
  }
  return tuplas;
}

export function validarOrigemModelos(origem, { catalogo = true } = {}) {
  if (!origem || typeof origem !== 'object' || Array.isArray(origem)) throw new Error('origem dos modelos obrigatória no handoff');
  if (origem.fonte === 'humano' && Object.keys(origem).length === 1) return { fonte: 'humano' };
  if (origem.fonte !== 'frota' || Object.keys(origem).sort().join(',') !== 'fonte,hash,tuplas,versao' ||
      !Number.isInteger(origem.versao) || origem.versao < 1 || !/^[0-9a-f]{64}$/.test(origem.hash ?? '')) {
    throw new Error('origem dos modelos inválida no handoff');
  }
  const tuplas = catalogo ? validarBlocoExecutor(origem.tuplas) : formaDasTuplas(origem.tuplas);
  return { fonte: 'frota', versao: origem.versao, hash: origem.hash,
    tuplas: Object.fromEntries(Object.entries(tuplas).map(([p, t]) => [p, { ...t }])) };
}

export function validarHandoff({ papel, tentativaId = null, resultado, evidencia, resumo, origemModelos }, { catalogo = true } = {}) {
  if (!PAPEIS.has(papel)) throw new Error('papel de handoff inválido');
  if (!RESULTADOS.has(resultado)) throw new Error('resultado de handoff inválido');
  if (papel !== 'orquestracao' && !UUID.test(tentativaId ?? '')) throw new Error('tentativa obrigatória para desenvolvedor ou validador');
  if (tentativaId !== null && !UUID.test(tentativaId)) throw new Error('tentativa inválida');
  if (typeof resumo !== 'string' || resumo.trim().length < 10 || resumo.length > 2000) throw new Error('resumo de handoff inválido');
  if (!Array.isArray(evidencia) || !evidencia.length || evidencia.length > 10 || evidencia.some(x =>
    typeof x !== 'string' || x.trim().length < 5 || x.length > 500)) throw new Error('evidência de handoff obrigatória');
  return { papel, tentativaId, resultado, resumo: resumo.trim(), evidencia: evidencia.map(x => x.trim()),
    origemModelos: validarOrigemModelos(origemModelos, { catalogo }) };
}

export function codificarHandoff({ projetoId, cartaId, chaveIdempotencia, versaoCarta, ...entrada }) {
  if (![projetoId, cartaId, chaveIdempotencia].every(x => UUID.test(x ?? '')) || !Number.isFinite(Date.parse(versaoCarta))) {
    throw new Error('alvo ou versão de handoff inválidos');
  }
  const dados = { versao: 2, projetoId, cartaId, chaveIdempotencia, versaoCarta, ...validarHandoff(entrada) };
  const codigo = Buffer.from(JSON.stringify(dados), 'utf8').toString('base64url');
  const tentativa = dados.tentativaId ? ` tentativa=${dados.tentativaId}` : '';
  const origem = dados.origemModelos.fonte === 'frota' ? `<p>Frota v${dados.origemModelos.versao}: ${Object.entries(dados.origemModelos.tuplas)
    .map(([p, t]) => `${escapar(p)} ${escapar(t.provedor)}/${escapar(t.modelo)}/${escapar(t.esforco)}`).join(' · ')}</p>` : '';
  return `<p>[ORQ/v1 papel=${dados.papel}${tentativa}] ${MARCADOR}${codigo}</p><p>${escapar(dados.resumo)}</p>${origem}<ul>${dados.evidencia.map(x => `<li>${escapar(x)}</li>`).join('')}</ul>`;
}

function decodificar(e, { projetoId, cartaId }) {
  const v1 = e.texto.startsWith(MARCADOR_V1);
  const marcador = v1 ? MARCADOR_V1 : MARCADOR;
  let dados;
  try { dados = JSON.parse(Buffer.from(e.texto.slice(marcador.length).split(/\s/)[0], 'base64url').toString('utf8')); }
  catch { throw new Error('handoff do card ilegível'); }
  if (dados.versao !== (v1 ? 1 : 2) || dados.projetoId !== projetoId || dados.cartaId !== cartaId ||
      !UUID.test(dados.chaveIdempotencia ?? '') || !Number.isFinite(Date.parse(dados.versaoCarta))) {
    throw new Error('handoff do card não confere');
  }
  const normalizado = validarHandoff(v1 ? { ...dados, origemModelos: { fonte: 'humano' } } : dados, { catalogo: false });
  if (v1) normalizado.origemModelos = { fonte: 'perfil-ia' };
  if (dados.papel !== e.papel || (dados.tentativaId ?? null) !== e.tentativaId) throw new Error('cabeçalho de handoff não confere');
  return { ...dados, ...normalizado, comentarioId: e.id, autorId: e.autorId, quando: e.quando };
}

// Um handoff ruim no fio não derruba a carta (J9): fica de fora e é contado.
export function lerHandoffsDoCanal(interacoes, { projetoId, cartaId, autorId }) {
  if (!UUID.test(autorId ?? '')) throw new Error('identidade de escrita não configurada');
  const handoffs = [];
  let ilegiveis = 0;
  for (const e of interacoes) {
    if (!(e.texto?.startsWith(MARCADOR) || e.texto?.startsWith(MARCADOR_V1)) || e.autorId !== autorId) continue;
    try { handoffs.push(decodificar(e, { projetoId, cartaId })); } catch { ilegiveis += 1; }
  }
  return { handoffs, ilegiveis };
}

export function handoffsDoCanal(interacoes, alvo) {
  return lerHandoffsDoCanal(interacoes, alvo).handoffs;
}
