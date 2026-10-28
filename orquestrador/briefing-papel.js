// O texto que cada papel recebe: carta, contrato e o molde do briefing.

import fs from 'node:fs/promises';
import path from 'node:path';

const MOLDES = path.join(import.meta.dirname, 'briefings');
const MISSAO = { 'READY TO DEV': 'implementar a carta', 'READY TO TEST': 'testar e validar o que já está implementado' };

export function cortar(texto, max) {
  const s = String(texto ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function textoVisivel(html = '') {
  return (typeof html === 'string' ? html : '').replace(/<\/(?:p|div|li|h[1-6]|br)>|<br\s*\/>/gi, '\n')
    .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function comandosDoContrato(contrato, comando) {
  const lista = contrato?.comandos?.length ? contrato.comandos : [comando];
  return lista.map(c => `\`${c.executavel} ${c.argumentos.join(' ')}\` (${c.id})`).join(', ');
}

export class BriefingPapel {
  renderizar(molde, valores) {
    return molde.replace(/\{\{(\w+)\}\}/g, (tudo, chave) => (chave in valores ? String(valores[chave]) : tudo));
  }

  molde(nome) {
    return fs.readFile(path.join(MOLDES, `${nome}.md`), 'utf8');
  }

  contexto({ carta, tentativaId, projeto, cardPlane, gateDaFila, contrato, comando, ramo }) {
    const gate = gateDaFila ?? (cardPlane.labels ?? []).map(l => l?.name ?? l).find(n => MISSAO[n]) ?? 'READY TO DEV';
    return {
      identificador: carta, tentativaId, projeto, titulo: cardPlane.name ?? '', descricao: textoVisivel(cardPlane.description_html) || '(sem descrição)',
      gate, missao: MISSAO[gate] ?? 'implementar a carta', ramo,
      ambiente: contrato?.ambiente ?? 'offline', tiposTeste: (contrato?.tiposTeste ?? []).join('; ') || '—',
      criteriosAceite: (contrato?.criteriosAceite ?? []).join('; ') || '—', acoesProibidas: (contrato?.acoesProibidas ?? []).join('; ') || '—',
      comandos: comandosDoContrato(contrato, comando), comandoDeAceite: `${comando.executavel} ${comando.argumentos.join(' ')}`,
    };
  }
}
