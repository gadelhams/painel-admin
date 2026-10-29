# Testes de navegador do Orquestrador

Esta pasta tem seu próprio pacote de desenvolvimento: não acrescenta
dependências ao processo nem ao `npm test` do Painel. Os testes locais servem
`../publico/` em `127.0.0.1:17777`, com Plane e Cadastro Único simulados.
Nenhuma requisição alcança a 7777, o Plane, o SSO ou uma CLI paga. A fixture
recusa escritas fora das rotas de validação/preparação simuladas.

No Omarchy, dentro desta pasta:

```sh
npm ci
npm test
```

O Chromium de `/usr/bin/chromium` é usado quando existe. Em outro Linux,
defina `ORQ_E2E_CHROMIUM` com o executável local ou instale o navegador
Playwright. Falha e trace ficam em `test-results/`, ignorado pelo Git; não
contêm sessão real.

## Prova final do SSO no Windows

O arquivo `windows-sso-smoke.mjs` é **separado** da suíte local. Rode-o somente
no Windows autorizado pelo tailnet, numa cópia desta pasta que contenha
`package-lock.json`. São necessários Node/npm e Chrome (ou Edge):

```powershell
npm ci
npm run test:sso
```

Para usar Edge: `$env:ORQ_E2E_BROWSER='msedge'; npm run test:sso`.
O programa abre um contexto novo e temporário em `astargne.com/login`, espera
até 10 minutos para o dono entrar **na janela aberta**, e então abre a
sub-aba Frota (desde 29/10/2026; antes era o perfil por carta do PLAYER-38).
Ele monta uma frota mista nos quatro papéis, chama somente `frota/preparar`,
prova que aparece a segunda confirmação, mas **não clica em confirmar**.
Qualquer outro POST é bloqueado; executor real ligado aborta a prova, e a
frota lida antes e depois tem de ser a mesma.
Senha, cookie, `storageState`, screenshot e trace reais não são salvos nem
impressos. Ao terminar, a janela fecha e o terminal mostra PASSOU ou FALHOU.
A versão da Frota ainda não rodou no Windows.

Esta prova não testa gravação da frota, disponibilidade real de CLIs,
despacho, comandos do PLAYER, stream, deploy ou ciclos do Supervisor.
