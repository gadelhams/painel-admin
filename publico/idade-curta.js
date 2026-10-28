// Idade curta de uma data. Não desenha seção.

class IdadeCurta {
  static de(iso) {
    if (!iso) return '—';
    const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return dias <= 0 ? 'hoje' : `${dias}d`;
  }
}

function idadeCurta(iso) {
  return IdadeCurta.de(iso);
}

globalThis.IdadeCurta = IdadeCurta;
