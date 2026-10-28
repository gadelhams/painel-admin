// Sinais de docs/current.md: data atrasada e carta fechada ainda citada.

import fs from 'node:fs/promises';
import path from 'node:path';
import { ATRASO_DOC_DIAS, RE_CARTA, dataDoCabecalho, existe } from './medidas.js';

const RE_HISTORICO = /selad|done|fechad|cancelad|feit[oa]|conclu|publicad|resolvid|superad/i;

export class SinalCurrent {
  async ler({ dirRepo, dataCommit, temGit, plane, projeto }) {
    const sinais = [];
    const current = path.join(dirRepo, 'docs', 'current.md');
    if (await existe(current)) {
      const texto = await fs.readFile(current, 'utf8');
      const dataDoc = dataDoCabecalho(texto);
      if (dataDoc && dataCommit) {
        const dias = Math.round((Date.parse(dataCommit) - Date.parse(dataDoc)) / 86_400_000);
        if (dias > ATRASO_DOC_DIAS) sinais.push({ tipo: 'current_atras', gravidade: 'media', texto: `docs/current.md datado de ${dataDoc} e último commit em ${dataCommit} (${dias} dias)`, arquivo: 'docs/current.md' });
      }
      if (plane && projeto.plane) {
        const porId = new Map(plane.issues.filter((i) => i.project.id === projeto.plane).map((i) => [i.identifier, i]));
        const pendentes = new Map();
        for (const linha of texto.split('\n')) {
          if (RE_HISTORICO.test(linha)) continue;
          for (const m of linha.matchAll(RE_CARTA)) pendentes.set(`${m[1]}-${m[2]}`, linha.trim().slice(0, 90));
        }
        for (const [id, linha] of pendentes) {
          const i = porId.get(id);
          if (i && (i.state.type === 'completed' || i.state.type === 'canceled')) sinais.push({ tipo: 'cita_fechado', gravidade: 'baixa', texto: `docs/current.md trata ${id} como pendente, mas está ${i.state.name}: "${linha}"`, carta: id, url: i.url });
        }
      }
    } else if (temGit) sinais.push({ tipo: 'sem_current', gravidade: 'baixa', texto: 'sem docs/current.md' });
    return sinais;
  }
}
