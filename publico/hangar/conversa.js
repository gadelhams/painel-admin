// Conversa com o C-3PO dentro do popup do Hangar: a pergunta vai a /api/conversa com o contexto do
// objeto clicado e a resposta chega em SSE. A sessão é a mesma do /c3po/, para dar para continuar lá. Sem voz.

// O parser de SSE é o mesmo da tela /c3po/; o arquivo clássico também roda como módulo e se pendura no globalThis.
import '../c3po/fluxo-sse.js';
import { $ } from './util.js';

const MAX_CONTEXTO = 400;
const CHAVE_SESSAO = 'c3po-sessao';

let abortador = null;

// O C-3PO não vê a cena: o contexto vai como texto na frente da pergunta.
export function perguntaComContexto(contexto, pergunta) {
  const c = String(contexto ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CONTEXTO);
  const p = String(pergunta ?? '').trim();
  return c ? `[No Hangar do painel, olhando: ${c}] ${p}` : p;
}

// Título e subtítulo do popup viram "olho · título · subtítulo", sem HTML.
export function contextoDoPopup() {
  const titulo = [...$('hg-holo-titulo').childNodes].map((n) => n.textContent.trim()).filter(Boolean);
  return [$('hg-holo-olho').textContent.trim(), ...titulo].filter(Boolean).join(' · ');
}

const lerSessao = () => { try { return sessionStorage.getItem(CHAVE_SESSAO) || undefined; } catch { return undefined; } };
const gravarSessao = (s) => { try { sessionStorage.setItem(CHAVE_SESSAO, s); } catch { /* sem storage: a conversa segue, só não continua no /c3po/ */ } };

function linha(classe, texto) {
  const p = document.createElement('p');
  p.className = classe;
  p.textContent = texto;
  const r = $('hg-conversa-resp');
  r.hidden = false;
  r.append(p);
  r.scrollTop = r.scrollHeight;
  return p;
}

// Trocar de objeto ou fechar o popup corta a resposta em curso; a sessão do C-3PO continua.
export function limparConversa() {
  abortador?.abort();
  abortador = null;
  const r = $('hg-conversa-resp');
  r.replaceChildren();
  r.hidden = true;
  $('hg-conversa-enviar').disabled = false;
}

export async function perguntar(contexto, pergunta) {
  if (!pergunta.trim()) return;
  abortador?.abort();
  const meu = new AbortController();
  abortador = meu;
  linha('hg-conversa-eu', pergunta.trim());
  const fala = linha('hg-conversa-c3po hg-pensando', 'calculando…');
  const enviar = $('hg-conversa-enviar');
  enviar.disabled = true;
  let recebeu = false;
  try {
    const resposta = await fetch('/api/conversa', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mensagem: perguntaComContexto(contexto, pergunta), sessao: lerSessao() }),
      signal: meu.signal,
    });
    if (!resposta.ok || !resposta.body) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.erro || `HTTP ${resposta.status}`);
    }
    const leitor = resposta.body.getReader();
    const decodificador = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      buffer += decodificador.decode(value, { stream: true });
      const { eventos, resto } = globalThis.FluxoSse.extrair(buffer);
      buffer = resto;
      for (const { evento, dados } of eventos) {
        if (evento === 'token') {
          if (!recebeu) { fala.textContent = ''; fala.classList.remove('hg-pensando'); recebeu = true; }
          fala.textContent += dados.texto;
        } else if ((evento === 'inicio' || evento === 'fim') && dados.sessao) {
          gravarSessao(dados.sessao);
        } else if (evento === 'erro') {
          linha('hg-conversa-erro', dados.mensagem);
        }
      }
    }
    if (!recebeu) fala.remove();
  } catch (erro) {
    if (erro.name === 'AbortError') return;
    fala.remove();
    linha('hg-conversa-erro', `Oh, não! A conversa falhou: ${erro.message}`);
  } finally {
    if (abortador === meu) { abortador = null; enviar.disabled = false; }
  }
}
