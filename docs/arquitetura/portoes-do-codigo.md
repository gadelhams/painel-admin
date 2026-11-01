# Portões do código (sem linter)

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

**Decisão (31/10/2026, PAINEL-55): o painel não tem linter; o portão é `npm test`** — suíte
`node --test`, `check-docs` e `mapa-modulos.mjs --check`. Regra estrutural vira teste ou script
com autoteste, não configuração de ferramenta:

- `scripts/mapa-modulos.mjs` reprova módulo sem cabeçalho e mapa desatualizado; o mapa leva a
  **primeira linha inteira** do cabeçalho (se ela não fecha frase, segue até o primeiro ponto).
  Desde 01/11/2026 (PAINEL-56) o mapa é o índice `docs/mapa.md` mais um arquivo por área (a
  primeira pasta) em `docs/mapa/`, partido em `<área>-1.md`, `<área>-2.md`… acima de 10.000
  caracteres; arquivo de área que o gerador não produz reprova, e regenerar o apaga.
  Módulo acima de 300 linhas só **avisa**; a exceção se declara numa linha do cabeçalho:
  `// exceção de tamanho: <por quê>; partir quando <condição>.` (sem "partir quando" não vale).
  Autoteste com fixture temporária: `test/mapa-modulos.test.js`.
- `test/fronteiras-modulos.test.js` lê os `import` e recusa: de fora de `alinhamento/`,
  `chaves/`, `coletores/`, `contas/`, `decisao/`, `encomendas/`, `motor/` e `plane/`, importar outra coisa que a porta
  `<área>.js`; de fora de `orquestrador/`, importar módulo fora das portas dele (`sso`, `fila`,
  `triagem`, `consulta-c3po`, `api-duas-acoes`, `desafio-duas-acoes`, `leitor-jsonl`, `uuid`);
  `http/` montado por outro que não `montagem.js`; `servidor.js` importar outra coisa que a
  montagem; `publico/` e servidor se importarem; o fecho do motor alcançar escritor do Plane,
  `estado-plane`, `executor-cli`, `api-*` de escrita, o registro das encomendas, o escritor, a aplicação e as duas ações
  da mesa de decisão (a porta `decisao.js` só reexporta a leitura da carta) ou o escritor, a API, a pendente e a
  reflexão da memória L1 (`memoria/`). `montagem.js` é isenta da regra de porta
  (quem compõe liga as peças). As violações de 31/10 ficaram como exceções nomeadas no teste,
  com o porquê; exceção resolvida reprova até sair da lista.
