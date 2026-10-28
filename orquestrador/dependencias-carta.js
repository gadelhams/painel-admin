// Junta a relação formal do Plane com o que a carta declara no texto.

import { RelacoesFormais } from './relacoes-formais.js';
import { TextoDependencia } from './texto-dependencia.js';

export class DependenciasCarta {
  constructor({ formais = new RelacoesFormais(), texto = new TextoDependencia() } = {}) {
    this.formais = formais;
    this.texto = texto;
  }

  daCarta(carta, relacoes, cartasPorId) {
    const formais = this.formais.ler(relacoes, cartasPorId);
    if (formais.erro) return formais.erro;
    const siglas = new Set([...cartasPorId.values()].map(c => c.sigla?.toUpperCase()).filter(Boolean));
    const texto = this.texto.ler(carta.description_html, siglas);
    const dependencias = [...formais.dependencias];
    for (const bloco of texto.blocos) {
      if (!bloco.codigos.length) {
        dependencias.push({ id: 'descrição', estado: 'não formalizada', motivo: 'dependência textual sem identificador auditável no Plane' });
      }
      for (const codigo of bloco.codigos) if (!formais.codigos.has(codigo)) {
        dependencias.push({ id: codigo, estado: 'não formalizada', motivo: 'dependência citada no texto sem relação formal correspondente no Plane' });
      }
    }
    if (formais.ids.length === 0 && !texto.blocos.length && !texto.declarouSem) {
      dependencias.push({ id: 'declaração', estado: 'não auditada', motivo: 'ausência de dependências não declarada na carta' });
    }
    if (formais.ids.length && texto.declarouSem) {
      dependencias.push({ id: 'declaração', estado: 'contraditória', motivo: 'texto declara nenhuma dependência, mas há relações formais no Plane' });
    }
    return dependencias;
  }
}

export function dependenciasDaCarta(carta, relacoes, cartasPorId) {
  return new DependenciasCarta().daCarta(carta, relacoes, cartasPorId);
}
