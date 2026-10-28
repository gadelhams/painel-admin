// Porta do serviço de chaves. O inventário lê; a troca grava; os dois compartilham o cache do servidor.

import os from 'node:os';
import path from 'node:path';
import { spawn as spawnPadrao } from 'node:child_process';
import { criarExecutorSsh } from '../contas.js';
import { CATALOGO, validarCatalogo, RAIZ, TIMEOUT_TROCA_MS } from './catalogo.js';
import { DiarioChaves } from './eventos.js';
import { InventarioChaves } from './inventario.js';
import { TrocaChaves } from './troca.js';

export function criarServicoChaves({ catalogo = CATALOGO, raiz = RAIZ,
  diretorioEstado = path.join(os.homedir(), '.local', 'state', 'painel-admin'),
  executar: executarOpcional = null, executarTroca = null, spawn = spawnPadrao, agora = Date.now,
  escritaServidorHabilitada = process.env.CHAVES_SERVIDOR_ESCRITA?.trim() === 'true', log = console.error } = {}) {
  const erros = validarCatalogo(catalogo);
  if (erros.length) throw new Error(`catálogo de chaves inválido: ${erros.join('; ')}`);
  const executar = executarOpcional ?? criarExecutorSsh();
  const trocaSsh = executarTroca ?? executarOpcional ?? criarExecutorSsh({ timeoutMs: TIMEOUT_TROCA_MS });
  const cache = { atual: null };
  const diario = new DiarioChaves({ diretorioEstado, agora });
  const inventario = new InventarioChaves({ catalogo, raiz, diario, agora, escritaServidorHabilitada, executar, cache });
  const troca = new TrocaChaves({ catalogo, raiz, diario, agora, escritaServidorHabilitada, trocaSsh, spawn, log, cache });
  return {
    inventario: () => inventario.ler(),
    lerServidor: () => inventario.lerServidor(),
    preparar: (pedido) => troca.preparar(pedido),
    confirmar: (pedido, valor, usuarioId) => troca.confirmar(pedido, valor, usuarioId),
    scriptInventarioServidor: () => inventario.scriptServidor(),
    scriptTrocaServidor: (arquivo, nome, unit) => troca.scriptServidor(arquivo, nome, unit),
  };
}
