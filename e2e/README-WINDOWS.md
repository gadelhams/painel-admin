# Prova SSO do Orquestrador no Windows

Este pacote contém **somente** o smoke final de SSO. A suíte de nove testes
com Plane/SSO simulados já foi executada no Omarchy, no repositório completo;
`npm test` exige os arquivos estáticos do Painel e não é o comando deste ZIP.

1. Extraia o ZIP no Windows. Abra o PowerShell na pasta `e2e` extraída.
2. Confirme que o Windows está conectado ao tailnet e que Chrome está instalado.
3. Execute `npm ci` e depois `npm run test:sso`.
4. Uma **nova janela do Chrome** abrirá em `https://astargne.com/login`.
   Faça login nela com sua conta usual; não envie senha nem cookie ao chat.
5. Aguarde o terminal mostrar `PASSOU` ou `FALHOU` e envie **somente essas
   linhas do terminal**. A janela fecha ao fim. Não clique em "Confirmar
   registro no card" se ela aparecer; o script não clica nela.

Se usar Edge, substitua o passo 3 por:

```powershell
npm ci
$env:ORQ_E2E_BROWSER='msedge'; npm run test:sso
```

O script verifica os três campos por papel (provedor, modelo dependente e
esforço) e valida Claude/max + OpenAI/xhigh + Claude/max no
PLAYER-38, prepara a confirmação em memória e verifica que perfil, lease e
tentativa continuam ausentes. Não grava perfil, não despacha, não executa
comandos do PLAYER e não salva sessão, senha, cookie, screenshot ou trace.
Aborta se o executor real estiver ligado ou se já existir perfil/lease/tentativa.
Após abrir “Papéis e modelos”, aguarda a resposta da API antes de contar os
três seletores; se eles não aparecerem, imprime o motivo exibido pela UI.
Qualquer requisição de escrita fora das duas rotas de validação/preparo é
bloqueada. O terminal separa tentativas bloqueadas dirigidas ao Painel das
de outras origens; só uma tentativa inesperada no Painel reprova essa checagem.
