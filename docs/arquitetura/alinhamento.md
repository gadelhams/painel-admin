# alinhamento.js

Parte da [arquitetura do painel](../arquitetura.md) (índice e adjudicação; os caminhos em crase são relativos à raiz do projeto, não a `docs/`).

Porta. `alinhamento/fio-medida.js` conta o fio, `alinhamento/git-medida.js` lê o git, `alinhamento/portao-docs.js` roda o check-docs e `alinhamento/regras-sinal.js` guarda as regras; `alinhamento/medidas.js` só reexporta. `alinhamento/cache.js` guarda o resultado, `alinhamento/fios.js` mede os
comentários e `alinhamento/sinais.js` junta `sinal-git.js`, `sinal-current.js` e `sinal-fio.js`. `alinhamento/varredura.js`
só percorre a lista.

(25/10/2026, decisão do dono) — rotina de **alinhamento código ⇄ Plane ⇄
painel**: mede a dívida em vez de deixá-la crescer em silêncio. A cada 30 min
(e em `GET /api/alinhamento?agora=1`) varre cada projeto não congelado e emite
sinais: `fio_longo` (card com ≥ 8 comentários desde o último `COMPACTADO/v1`,
regra do `../../PADROES-BACKLOG.md` § Compactação), `selado_sem_compactar`
(Done/Cancelled depois de 25/10 com comentário e sem a marca),
`current_atras` (`docs/current.md` datado > 7 dias antes do último commit),
`cita_fechado` (linha do `current.md` trata como pendente um card já
Done/Cancelled — menção histórica "X selada" não conta), `sem_push`,
`atras_remoto`, `check_docs` (portão do projeto com erro), `sem_current`,
`catalogo` (pasta ausente). Fios só se remedem para cartas cujo `updatedAt`
mudou (cache em `~/.local/state/painel-admin/alinhamento.json`); a varredura
inteira leva ~45 s com 450 cartas. Devolve também onde mora a documentação
**funcional / arquitetural / técnica / contrato** de cada projeto (primeiro
candidato existente por tipo). Só leitura: quem corrige é o orquestrador no
fecho. Consumidores: aba Docs (`publico/docs.js`) e a ferramenta
`alinhamento` do C-3PO.
