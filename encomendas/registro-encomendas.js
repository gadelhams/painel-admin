// Registra uma encomenda de nave como linha `pedida` em `encomendas.jsonl`, serializada no processo; não cria projeto no Plane nem mexe no catálogo.
//
// Quem atende é o orquestrador (docs/operacao.md § Encomendas de nave). A sigla não pode
// colidir com a de um projeto do catálogo nem com a de outra encomenda pendente; a checagem
// se repete na gravação, dentro da fila, porque duas confirmações podem ter passado pelo
// preparar com o mesmo diário.
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJETOS } from '../projetos.js';
import { anexarJsonl } from '../orquestrador/leitor-jsonl.js';
import { lerEncomendas, NOME_ARQUIVO } from './leitura-encomendas.js';
import { validarPedido, RecusaEncomenda } from './pedido-encomenda.js';

// Recusa que provadamente não gravou: o esqueleto das duas ações a devolve limpa.
const semEscrita = mensagem => Object.assign(new Error(mensagem), { semEscrita: true });

export function criarRegistroEncomendas({ diretorio, projetos = PROJETOS, agora = Date.now }) {
  const arquivo = path.join(diretorio, NOME_ARQUIVO);
  let fila = Promise.resolve();

  async function ocupadas() {
    const lido = await lerEncomendas(arquivo);
    if (!lido.legivel) throw new RecusaEncomenda('diário de encomendas ilegível; nada foi gravado até o orquestrador corrigir o arquivo');
    const mapa = new Map(projetos.filter(p => p.sigla).map(p => [p.sigla, `do projeto ${p.pasta} no catálogo`]));
    for (const e of lido.pendentes) if (e.sigla && !mapa.has(e.sigla)) mapa.set(e.sigla, 'de outra encomenda pendente');
    return mapa;
  }

  return {
    arquivo,
    pendentes: () => lerEncomendas(arquivo),
    async validar(entrada) {
      return validarPedido(entrada, { siglasOcupadas: await ocupadas() });
    },
    registrar(pedido, usuarioId) {
      const vez = fila.then(async () => {
        let limpo;
        try { limpo = validarPedido(pedido, { siglasOcupadas: await ocupadas() }); }
        catch (erro) { if (erro instanceof RecusaEncomenda) throw semEscrita(erro.message); throw erro; }
        const registro = { id: randomUUID(), quando: new Date(agora()).toISOString(), usuarioId, ...limpo, estado: 'pedida' };
        await fs.mkdir(diretorio, { recursive: true, mode: 0o700 });
        await anexarJsonl(arquivo, registro);
        const { usuarioId: _, ...publico } = registro;
        return publico;
      });
      fila = vez.catch(() => {});
      return vez;
    },
  };
}
