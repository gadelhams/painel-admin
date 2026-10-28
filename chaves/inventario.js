// Junta o inventário local e o do servidor no mesmo cache de nomes.

import { InventarioLocal } from './inventario-local.js';
import { InventarioServidor } from './inventario-servidor.js';

export class InventarioChaves {
  constructor({ catalogo, raiz, diario, agora, escritaServidorHabilitada, executar, cache }) {
    this.local = new InventarioLocal({ catalogo, raiz, diario, agora, escritaServidorHabilitada, cache });
    this.remoto = new InventarioServidor({ catalogo, agora, executar, cache, lerLocal: () => this.local.ler() });
  }

  ler() { return this.local.ler(); }

  scriptServidor() { return this.remoto.script(); }

  lerServidor() { return this.remoto.ler(); }
}
