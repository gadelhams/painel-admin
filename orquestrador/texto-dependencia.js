// Declarações de dependência no texto da carta. Não olha a relação formal do Plane.

export class TextoDependencia {
  visivel(html = '') {
    return (typeof html === 'string' ? html : '').replace(/<\/(?:p|div|li|h[1-6]|br)>|<br\s*\/>/gi, '\n')
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[^\S\n]+/g, ' ');
  }

  ler(html, siglas) {
    const descricao = this.visivel(html);
    const declarouSem = /(?:^|\n)[ \t]*(?:[-*•][ \t]*)?(?:sem depend[eê]ncias|depend[eê]ncias[ \t]*:[ \t]*nenhuma)[ \t]*[.!?;:]?[ \t]*$/im.test(descricao);
    const blocos = [...descricao.matchAll(/\b(?<!\bsem\s{1,3})(?:depende\s+d[aeo]|depend[eê]ncias)\s*:\s*(?![ \t]*nenhuma\b)([^\n]*(?:\n[ \t]*(?:[-*•][ \t]*)?[A-Za-z][A-Za-z0-9]{1,15}-\d+\b[^\n]*)*)/gi)]
      .map(declaracao => ({
        codigos: [...new Set((declaracao[1].match(/\b[A-Za-z][A-Za-z0-9]{1,15}-\d+\b/g) ?? []).map(x => x.toUpperCase()))]
          .filter(codigo => siglas.has(codigo.split('-')[0])),
      }));
    return { declarouSem, blocos };
  }
}
