#!/usr/bin/env node
// Reserva (ou solta) uma carta do Plane para a sessão que o roda: `node reservar.mjs SIGLA-N [--soltar]`, de qualquer pasta. Não trabalha na carta nem a fecha.
//
// Regra transversal (PAINEL-54 item 9, dono em 31/10/2026: "como evitar double work?"): todo
// ator reserva antes de trabalhar numa carta. A sessão é a CLI ancestral (claude → CLAUDE_CODE,
// codex → CODEX) ou, sem CLI, o shell do humano. O painel (127.0.0.1:7777) resolve SIGLA-N; o
// lease local é gravado aqui, sob a trava da orquestração; para sessão de CLI o painel ainda
// comenta RESERVA/v1 na carta e a põe em In Progress pela identidade técnica do projeto.
// Saída: 0 reservada/solta; 1 recusada (outra sessão viva ou tentativa da frota); 2 erro.
import process from 'node:process';
import { ReservasCarta, sessaoAncestral } from '../orquestrador/reservas.js';

const PAINEL = `http://127.0.0.1:${process.env.PAINEL_PORTA ?? '7777'}`;
const [carta, opcao] = process.argv.slice(2);
const soltar = opcao === '--soltar';
const sair = (codigo, texto) => { (codigo ? console.error : console.log)(texto); process.exit(codigo); };

if (!/^[A-Z][A-Z0-9]*-\d{1,6}$/.test(carta ?? '') || (opcao !== undefined && !soltar)) sair(2, 'uso: node reservar.mjs SIGLA-N [--soltar]');

const cli = await sessaoAncestral(process.ppid);
const sessao = cli ?? { quem: 'HUMANO', pid: process.ppid };
let alvo;
try {
  const r = await fetch(`${PAINEL}/api/orquestracao/reservas?carta=${encodeURIComponent(carta)}`, { signal: AbortSignal.timeout(20_000) });
  alvo = await r.json();
  if (!r.ok) sair(2, `painel recusou resolver ${carta}: ${alvo.erro ?? r.status}`);
} catch (erro) { sair(2, `painel fora do ar (${erro.message}): reserva NÃO gravada; sem o painel ninguém despacha, mas avise o dono`); }

const reservas = new ReservasCarta();
const r = soltar ? await reservas.soltar({ cartaId: alvo.cartaId, carta, pid: sessao.pid })
  : await reservas.reservar({ cartaId: alvo.cartaId, carta, projetoId: alvo.projetoId, quem: sessao.quem, pid: sessao.pid,
    pasta: process.cwd(), sessao: process.env.CLAUDE_CODE_SESSION_ID ?? process.env.CODEX_SESSION_ID ?? null });
if (r.recusa) sair(1, `recusada: ${r.recusa}`);
if (soltar && !r.solta) sair(0, r.motivo);
const resumo = soltar ? `${carta} solta` : `${carta} reservada para ${sessao.quem} (pid ${sessao.pid}) até ${r.reserva.validaAte}${r.renovada ? ' (renovada)' : ''}`;
if (!cli) sair(0, `${resumo}; sem CLI ancestral: só o lease local, sem comentário no Plane`);
try {
  const p = await fetch(`${PAINEL}/api/orquestracao/reservas`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ carta, acao: soltar ? 'soltar' : 'reservar', reserva: (r.reserva ?? {}).id }), signal: AbortSignal.timeout(60_000) });
  const corpo = await p.json().catch(() => ({}));
  if (!p.ok) sair(0, `${resumo}; aviso: o painel não comentou na carta (${corpo.erro ?? p.status})`);
  sair(0, `${resumo}${corpo.comentado ? `; RESERVA/v1 comentada${corpo.estado ? `, estado: ${corpo.estado}` : ''}` : `; aviso: ${corpo.aviso}`}`);
} catch (erro) { sair(0, `${resumo}; aviso: comentário no Plane não confirmado (${erro.message})`); }
