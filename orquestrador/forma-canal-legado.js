// Forma do JSON do leitor legado. Não abre processo.

const CAMPOS_LISTA = ['cards', 'pendencias', 'sugestoes', 'integridade', 'blocosLocais', 'touchpoints'];

export class FormaCanalLegado {
  normalizar(bruto, config) {
    if (!bruto || typeof bruto !== 'object' || bruto.versao !== 1) throw new Error('forma do JSON inesperada');
    const estado = { config, disponivel: true, motivo: null };
    for (const chave of ['documento', 'repositorio', 'geradoEm', 'commit', 'head', 'origin', 'protocolo', 'ultimoBloco', 'erro']) {
      estado[chave] = bruto[chave] ?? null;
    }
    for (const chave of CAMPOS_LISTA) estado[chave] = Array.isArray(bruto[chave]) ? bruto[chave] : [];
    estado.recusas = bruto.recusas && typeof bruto.recusas === 'object' ? bruto.recusas : {};
    estado.pausas = bruto.pausas && typeof bruto.pausas === 'object' ? bruto.pausas : {};
    estado.trava = { ativa: Boolean(bruto.trava?.ativa), idadeSegundos: Number.isFinite(bruto.trava?.idadeSegundos) ? bruto.trava.idadeSegundos : null };
    estado.execucao = { arquivo: bruto.execucao?.arquivo ?? null, modificadoHa: Number.isFinite(bruto.execucao?.modificadoHa) ? bruto.execucao.modificadoHa : null,
      cauda: typeof bruto.execucao?.cauda === 'string' ? bruto.execucao.cauda.slice(-4000) : '' };
    estado.emCurso = bruto.emCurso && typeof bruto.emCurso === 'object' ? bruto.emCurso : null;
    estado.touchpoints = estado.touchpoints.slice(0, 20);
    return estado;
  }
}
