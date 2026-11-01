# painel-admin — mapa: alinhamento (gerado)

Parte do [mapa de módulos](../mapa.md); gerado, não edite.

## alinhamento/

- `cache.js` — Cache da varredura em disco. Não decide sinal.
- `fio-medida.js` — Conta comentários desde a última marca de compactação. Não fala com o Plane.
- `fios.js` — Mede o fio de comentários de cada carta. O resultado fica no cache.
- `git-medida.js` — Um comando git com teto de tempo. Não interpreta o alinhamento.
- `medidas.js` — Porta das medidas. O fio, o git, o portão e as regras moram ao lado.
- `portao-docs.js` — Roda o check-docs do projeto e devolve a contagem de erros.
- `regras-sinal.js` — Regras que o sinal de um projeto aplica. Não varrem o disco.
- `sinais.js` — Junta os sinais de um projeto. Git, current.md e fio moram ao lado.
- `sinal-current.js` — Sinais de docs/current.md: data atrasada e carta fechada ainda citada.
- `sinal-fio.js` — Sinais do fio de comentários: longo demais, ou selado sem compactar.
- `sinal-git.js` — Sinais de git: commits sem push e atraso do remoto.
- `varredura.js` — Percorre os projetos e junta o resultado. Cache, fios e sinais moram nos módulos ao lado.
