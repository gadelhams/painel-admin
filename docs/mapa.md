# painel-admin — mapa de módulos (gerado)

Gerado por `node scripts/mapa-modulos.mjs`, um arquivo por área em `mapa/`; o `npm test`
falha se algum estiver desatualizado. Cada linha é o cabeçalho do próprio módulo: o que faz
e o que **não** faz. Mudança simples: busque, não leia inteiro (`rg -n 'trava|lease' docs/mapa/`),
abra só esse módulo e o `test/<área>.test.js` correspondente, rode `npm test`. O porquê de
cada mecanismo está em [`arquitetura.md`](arquitetura.md); o estado, em
[`current.md`](current.md).

- [`mapa/raiz.md`](mapa/raiz.md) — `raiz`
- [`mapa/acoes.md`](mapa/acoes.md) — `acoes/`
- [`mapa/alinhamento.md`](mapa/alinhamento.md) — `alinhamento/`
- [`mapa/chaves.md`](mapa/chaves.md) — `chaves/`
- [`mapa/coletores.md`](mapa/coletores.md) — `coletores/`
- [`mapa/contas.md`](mapa/contas.md) — `contas/`
- [`mapa/decisao.md`](mapa/decisao.md) — `decisao/`
- [`mapa/e2e.md`](mapa/e2e.md) — `e2e/`, `e2e/tests/`
- [`mapa/encomendas.md`](mapa/encomendas.md) — `encomendas/`
- [`mapa/http.md`](mapa/http.md) — `http/`
- [`mapa/memoria.md`](mapa/memoria.md) — `memoria/`
- [`mapa/motor.md`](mapa/motor.md) — `motor/`
- [`mapa/orquestrador-1.md`](mapa/orquestrador-1.md) — `orquestrador/` (`agendador-instancia.js` a `protocolo-perfil.js`)
- [`mapa/orquestrador-2.md`](mapa/orquestrador-2.md) — `orquestrador/` (`recibo-gate.js` a `zelador.js`)
- [`mapa/plane.md`](mapa/plane.md) — `plane/`
- [`mapa/publico-1.md`](mapa/publico-1.md) — `publico/`, `publico/c3po/`, `publico/hangar/`
- [`mapa/publico-2.md`](mapa/publico-2.md) — `publico/orquestracao/`
- [`mapa/scripts.md`](mapa/scripts.md) — `scripts/`
- [`mapa/test-1.md`](mapa/test-1.md) — `test/` (`acoes.test.js` a `zelador-simulacao.test.js`)
- [`mapa/test-2.md`](mapa/test-2.md) — `test/` (`zelador.test.js` a `zelador.test.js`), `test/fixtures/`, `test/fixtures/canal-legado/`, `test/fixtures/executor-cli/`, `test/fixtures/frota/`, `test/fixtures/zelador/`
