// Conta comentários desde a última marca de compactação. Não fala com o Plane.

export const LIMIAR_FIO = 8;
export const MARCA_COMPACTADO = 'COMPACTADO/v1';

export class ContagemFio {
  medir(comentarios) {
    const ordenados = [...comentarios].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    let desdeCompactado = 0;
    let compactadoEm = null;
    for (const c of ordenados) {
      if (String(c.comment_html ?? '').includes(MARCA_COMPACTADO)) { desdeCompactado = 0; compactadoEm = c.created_at; } else desdeCompactado += 1;
    }
    return { total: ordenados.length, desdeCompactado, compactadoEm, ultimoEm: ordenados.at(-1)?.created_at ?? null };
  }
}

export function medirFio(comentarios) {
  return new ContagemFio().medir(comentarios);
}
