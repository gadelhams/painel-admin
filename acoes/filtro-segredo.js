// Tira segredo de texto que vai para o chat ou para o diário (saída de teste, git, conversa, memória). Não decide o que mostrar.
//
// Parte do redigirSegredo da aba Contas (Bearer) e soma o que uma suíte de testes
// costuma imprimir: atribuição NOME_COM_KEY/TOKEN/SECRET/PASSWORD=valor, formatos
// conhecidos de chave (Anthropic/OpenAI, xAI, GitHub, Plane, AWS, JWT, chave privada,
// Stripe, Google, Slack, Discord), senha em URL e "senha é X", e o valor literal de toda
// variável de ambiente do painel com nome de segredo — a saída de `npm test` pode ecoar o
// .env de quem roda. É de MELHOR ESFORÇO (docs/invariants.md §6): formato desconhecido passa.
import { redigirSegredo } from '../contas.js';

const NOME_SEGREDO = /(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|SENHA|CREDENTIAL|COOKIE|SESSION)/i;
const ATRIBUICAO = /\b([A-Za-z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASSWD|SENHA|CREDENTIAL)[A-Za-z0-9_]*["']?\s*[=:]\s*["']?)[^\s"',;]+/gi;
const FORMATOS = [
  /\bsk-[A-Za-z0-9_-]{16,}/g,
  /\bxai-[A-Za-z0-9_-]{16,}/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bplane_api_[A-Za-z0-9]{16,}/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g,
  /\bsk_[A-Za-z0-9]{32,}/g, // ElevenLabs e afins: sk_ + 32 ou mais
  /\bAIza[0-9A-Za-z_-]{30,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,
  /\b[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,40}\b/g,
];
// scheme://usuario:senha@host — só a senha sai.
const URL_COM_SENHA = /\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi;
// "senha é X" / "password is X": X com cara de credencial (6+, com dígito ou símbolo), não uma palavra.
const SENHA_DITA = /\b((?:senha|password|passwd)\s+(?:é|e|is|eh)\s+)(?=[^\s]*[0-9!@#$%^&*_+=?-])[^\s]{6,}/gi;

const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function filtrarSegredo(texto, ambiente = process.env) {
  // Valor literal primeiro: depois dos padrões, um pedaço dele já não casaria.
  let saida = String(texto ?? '');
  for (const [nome, valor] of Object.entries(ambiente ?? {})) {
    if (typeof valor === 'string' && valor.length >= 8 && NOME_SEGREDO.test(nome)) saida = saida.replace(new RegExp(escapar(valor), 'g'), '***');
  }
  saida = redigirSegredo(saida).replace(ATRIBUICAO, '$1***').replace(URL_COM_SENHA, '$1***@').replace(SENHA_DITA, '$1***');
  for (const f of FORMATOS) saida = saida.replace(f, '***');
  return saida;
}
