// Declarações de dependência no texto da carta. Não olha a relação formal do Plane.

// PAINEL-62 (D2): o único parêntese aceito depois de "nenhuma" é o sufixo exato que o preparo do
// zelador escreve; "Dependências: nenhuma (exceto CAD-31)" continua sem declarar.
const DECLAROU_SEM = /(?:^|\n)[ \t]*(?:[-*•][ \t]*)?(?:sem depend[eê]ncias|depend[eê]ncias[ \t]*:[ \t]*nenhuma(?:[ \t]\(declarada pelo zelador do Hangar em \d{2}\/\d{2}\/\d{4}\))?)[ \t]*[.!?;:]?[ \t]*$/im;

// A linha de texto (já visível) declara a ausência de dependências.
export const linhaDeclaraSem = linha => DECLAROU_SEM.test(String(linha ?? ''));

// A data é a do dono (America/Sao_Paulo), não a UTC: às 23 h de lá já é outro dia em UTC.
const DATA_SP = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });

// A linha fixa que o preparo do zelador escreve; nenhum texto da CLI entra nela.
export function linhaDoZelador(agoraMs) {
  if (!Number.isFinite(agoraMs)) throw new Error('preparo sem instante para a data da declaração');
  return `Dependências: nenhuma (declarada pelo zelador do Hangar em ${DATA_SP.format(new Date(agoraMs))})`;
}

export class TextoDependencia {
  visivel(html = '') {
    return (typeof html === 'string' ? html : '').replace(/<\/(?:p|div|li|h[1-6]|br)>|<br\s*\/>/gi, '\n')
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/[^\S\n]+/g, ' ');
  }

  ler(html, siglas) {
    const descricao = this.visivel(html);
    const declarouSem = DECLAROU_SEM.test(descricao);
    const blocos = [...descricao.matchAll(/\b(?<!\bsem\s{1,3})(?:depende\s+d[aeo]|depend[eê]ncias)\s*:\s*(?![ \t]*nenhuma\b)([^\n]*(?:\n[ \t]*(?:[-*•][ \t]*)?[A-Za-z][A-Za-z0-9]{1,15}-\d+\b[^\n]*)*)/gi)]
      .map(declaracao => ({
        codigos: [...new Set((declaracao[1].match(/\b[A-Za-z][A-Za-z0-9]{1,15}-\d+\b/g) ?? []).map(x => x.toUpperCase()))]
          .filter(codigo => siglas.has(codigo.split('-')[0])),
      }));
    return { declarouSem, blocos };
  }
}
