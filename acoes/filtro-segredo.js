// Tira segredo de texto que vai para o chat ou para o diário (saída de teste, git). Não decide o que mostrar.
//
// Parte do redigirSegredo da aba Contas (Bearer) e soma o que uma suíte de testes
// costuma imprimir: atribuição NOME_COM_KEY/TOKEN/SECRET/PASSWORD=valor, formatos
// conhecidos de chave e o valor literal de toda variável de ambiente do
// painel com nome de segredo — a saída de `npm test` pode ecoar o .env de quem roda.
import { redigirSegredo } from '../contas/redacao.js';

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
];

const escapar = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function filtrarSegredo(texto, ambiente = process.env) {
  // Valor literal primeiro: depois dos padrões, um pedaço dele já não casaria.
  let saida = String(texto ?? '');
  for (const [nome, valor] of Object.entries(ambiente ?? {})) {
    if (typeof valor === 'string' && valor.length >= 8 && NOME_SEGREDO.test(nome)) saida = saida.replace(new RegExp(escapar(valor), 'g'), '***');
  }
  saida = redigirSegredo(saida).replace(ATRIBUICAO, '$1***');
  for (const f of FORMATOS) saida = saida.replace(f, '***');
  return saida;
}
