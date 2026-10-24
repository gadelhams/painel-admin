// Aba Contas (13/09/2026) — administração do CadastroUnico (o login único do
// astargne.com) sem sair do painel. Tudo aqui é projeção do que o central
// responde: usuários, convites pendentes e o formulário "Convidar". Cada
// busca e cada ação vira UMA chamada a /api/contas/* do painel, que por sua
// vez executa um ssh até o servidor (backend contas.js) — por isso não há
// polling: carrega ao ENTRAR na aba (app.js, rotear) e recarrega depois de
// cada ação. Reaproveita `el` (app.js); nunca innerHTML — e-mail e nome são
// dado de gente, não marcação.

const abaContasEl = document.getElementById('aba-contas');

let appsSso = []; // só os apps com sso: true — os únicos que aceitam permissão
let usuariosContas = [];
let convitesContas = [];
let usuarioEditando = null; // id do usuário com o editor de permissões aberto
let acaoEmCurso = false; // uma ação por vez: cada uma é um ssh de ~2 s
let ultimoConvite = null; // resposta do último "convidar", pra mostrar enviado/link
let statusContas = null; // { tipo: 'ok'|'erro'|'andamento', texto }

// ---------- chamadas ao painel ----------

async function pedirContas(metodo, caminho, corpo) {
  const resposta = await fetch(caminho, {
    method: metodo,
    headers: corpo !== undefined ? { 'content-type': 'application/json' } : {},
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  let dados = {};
  try { dados = await resposta.json(); } catch { /* corpo vazio */ }
  return { ok: resposta.ok, status: resposta.status, dados };
}

function mensagemDeErro(r) {
  return r.dados?.erro ? `${r.dados.erro} (HTTP ${r.status})` : `falha HTTP ${r.status}`;
}

// Devolve true quando carregou; false quando ficou em erro (o chamador decide
// se sobrescreve a mensagem). Um fetch que LANÇA (painel caiu, rede) também
// vira erro visível — sem o try/catch o status ficava em "andamento" e o
// botão "recarregar" travado para sempre.
async function carregarContas() {
  statusContas = { tipo: 'andamento', texto: 'buscando no servidor via ssh…' };
  desenharContas();
  try {
    const [apps, usuarios, convites] = await Promise.all([
      pedirContas('GET', '/api/contas/apps'),
      pedirContas('GET', '/api/contas/usuarios'),
      pedirContas('GET', '/api/contas/convites'),
    ]);
    const falha = [apps, usuarios, convites].find((r) => !r.ok);
    if (falha) {
      statusContas = { tipo: 'erro', texto: `não consegui carregar as contas: ${mensagemDeErro(falha)}` };
      desenharContas();
      return false;
    }
    appsSso = (apps.dados.apps ?? []).filter((a) => a.sso);
    usuariosContas = usuarios.dados.usuarios ?? [];
    convitesContas = convites.dados.convites ?? [];
    statusContas = { tipo: 'ok', texto: `atualizado ${new Date().toLocaleTimeString('pt-BR')}` };
  } catch (erro) {
    statusContas = { tipo: 'erro', texto: `não consegui carregar as contas: ${erro.message}` };
    desenharContas();
    return false;
  }
  desenharContas();
  return true;
}

// Toda ação segue o mesmo rito: trava a aba, chama, recarrega tudo do
// servidor (a lista é sempre o que o central diz, nunca um estado local
// ajustado na mão) e só então destrava — botões presos até a lista voltar,
// senão um segundo clique corre em cima de uma lista velha.
async function executarAcao(descricao, metodo, caminho, corpo) {
  if (acaoEmCurso) return null;
  acaoEmCurso = true;
  statusContas = { tipo: 'andamento', texto: `${descricao}… (ssh até o servidor)` };
  desenharContas();
  let r;
  try {
    r = await pedirContas(metodo, caminho, corpo);
  } catch (erro) {
    r = { ok: false, status: 0, dados: { erro: erro.message } };
  }
  if (!r.ok) {
    acaoEmCurso = false;
    statusContas = { tipo: 'erro', texto: `${descricao}: ${mensagemDeErro(r)}` };
    desenharContas();
    return r;
  }
  const recarregou = await carregarContas();
  acaoEmCurso = false;
  // A ação foi feita; se a recarga falhou, o erro dela fica visível (a lista
  // na tela pode estar velha) — "feito" só quando a lista também voltou.
  if (recarregou) statusContas = { tipo: 'ok', texto: `${descricao}: feito` };
  else statusContas = { tipo: 'erro', texto: `${descricao}: feito, mas ${statusContas.texto} — a lista pode estar velha` };
  desenharContas();
  return r;
}

// ---------- formatação ----------

function dataCurta(iso) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function expiraEm(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  const horas = Math.ceil(ms / 3_600_000);
  if (horas <= 0) return 'expirado';
  if (horas < 48) return `em ${horas} h`;
  return `em ${Math.ceil(horas / 24)} dias`;
}

function nomeDoApp(id) {
  return appsSso.find((a) => a.id === id)?.nome ?? id;
}

// Papéis por app (decisão do dono, 24/10/2026; ADR-0006 do central): o central
// manda, por app, `papeis` e `papelPadrao`; aqui cada app vira uma seleção
// "sem acesso / <papéis>". Central antigo (sem papéis) cai no comportamento
// de antes: entra / não entra.
function nomeDoPapel(appId, papelId) {
  return appsSso.find((a) => a.id === appId)?.papeis?.find((p) => p.id === papelId)?.nome ?? papelId;
}

// `permissoes` ([{app, papel}]) quando o central já tem papéis; senão `apps` (ids).
function permissoesDe(objeto) {
  if (Array.isArray(objeto.permissoes)) return objeto.permissoes;
  return (objeto.apps ?? []).map((app) => ({ app, papel: null }));
}

function chipsApps(permissoes) {
  if (!permissoes.length) return el('span', { class: 'discreto' }, 'nenhum app');
  return el('span', { class: 'chips-resumo' }, ...permissoes.map(({ app, papel }) =>
    el('span', { class: 'chip-app', title: `${app}${papel ? `:${papel}` : ''}` }, nomeDoApp(app), papel ? ` · ${nomeDoPapel(app, papel)}` : '')));
}

function seletoresApps(marcados, prefixo) {
  const atual = new Map(marcados.map((p) => [p.app, p.papel]));
  return el(
    'div',
    { class: 'contas-checkboxes' },
    ...appsSso.map((app) => {
      const papeis = app.papeis ?? [];
      if (!papeis.length) {
        const caixa = el('input', { type: 'checkbox', name: `${prefixo}-apps`, value: app.id });
        if (atual.has(app.id)) caixa.checked = true;
        return el('label', { class: 'contas-checkbox' }, caixa, ` ${app.nome} `, el('code', {}, app.id));
      }
      const sel = el('select', { name: `${prefixo}-papel`, 'data-app': app.id, class: 'contas-select' },
        el('option', { value: '' }, 'sem acesso'),
        ...papeis.map((pp) => el('option', { value: pp.id, title: pp.descricao }, `${pp.nome}${pp.id === app.papelPadrao ? ' (padrão)' : ''}`)));
      sel.value = atual.get(app.id) ?? '';
      return el('label', { class: 'contas-checkbox' }, `${app.nome} `, el('code', {}, app.id), ' ', sel);
    }),
  );
}

// Devolve `[{app, papel}]` para apps com papéis e ids puros para os sem (central antigo).
function appsMarcados(container, prefixo) {
  const comPapel = [...container.querySelectorAll(`select[name="${prefixo}-papel"]`)].filter((s) => s.value).map((s) => ({ app: s.dataset.app, papel: s.value }));
  const semPapel = [...container.querySelectorAll(`input[name="${prefixo}-apps"]:checked`)].map((c) => c.value);
  return [...comPapel, ...semPapel];
}

function botaoAcao(rotulo, aoClicar, extra = {}) {
  const b = el('button', { type: 'button', class: `botao-contas${extra.perigo ? ' perigo' : ''}`, ...(extra.title ? { title: extra.title } : {}) }, rotulo);
  if (acaoEmCurso) b.disabled = true;
  b.addEventListener('click', aoClicar);
  return b;
}

// ---------- usuários ----------

function editorPermissoes(u) {
  const caixa = el('div', { class: 'contas-editor' });
  const checks = seletoresApps(permissoesDe(u), `u${u.id}`);
  caixa.append(
    el('p', { class: 'kicker' }, 'permissão e papel por app (só apps com SSO); o app aplica o papel'),
    checks,
    el(
      'div',
      { class: 'contas-acoes' },
      botaoAcao('salvar', async () => {
        const apps = appsMarcados(checks, `u${u.id}`);
        const r = await executarAcao(`permissões de ${u.email}`, 'PUT', `/api/contas/usuarios/${u.id}/permissoes`, { apps });
        if (r?.ok) usuarioEditando = null;
        desenharContas();
      }),
      botaoAcao('cancelar', () => { usuarioEditando = null; desenharContas(); }),
    ),
  );
  return caixa;
}

function linhaUsuario(u) {
  const acoes = el(
    'div',
    { class: 'contas-acoes' },
    botaoAcao(usuarioEditando === u.id ? 'fechar' : 'permissões', () => {
      usuarioEditando = usuarioEditando === u.id ? null : u.id;
      desenharContas();
    }),
    u.ativo
      ? botaoAcao('desativar', () => {
        if (!confirm(`Desativar ${u.email}? As sessões abertas dessa pessoa são encerradas na hora.`)) return;
        executarAcao(`desativar ${u.email}`, 'POST', `/api/contas/usuarios/${u.id}/desativar`);
      }, { perigo: true })
      : botaoAcao('reativar', () => executarAcao(`reativar ${u.email}`, 'POST', `/api/contas/usuarios/${u.id}/reativar`)),
    botaoAcao('redefinir senha', async () => {
      const r = await executarAcao(`redefinição de senha de ${u.email}`, 'POST', `/api/contas/usuarios/${u.id}/redefinir`);
      if (r?.ok && r.dados.enviado === false) {
        statusContas = { tipo: 'erro', texto: `redefinição de ${u.email}: e-mail NÃO enviado — ${r.dados.erro ?? 'motivo desconhecido'}` };
        desenharContas();
      }
    }, { title: u.ativo ? 'manda o e-mail "redefinir senha" (o link expira; o prazo é o do central)' : 'só para usuário ativo' }),
  );

  const linha = el(
    'div',
    { class: `linha-conta${u.ativo ? '' : ' inativa'}` },
    el(
      'div',
      { class: 'conta-identidade' },
      el('div', { class: 'conta-nome' }, u.nome ?? '—', u.ativo ? '' : el('span', { class: 'etiqueta inativo' }, 'desativado')),
      el('div', { class: 'conta-email' }, u.email),
      el('div', { class: 'conta-meta' }, `#${u.id} · desde ${dataCurta(u.criado_em)}`),
    ),
    el('div', { class: 'conta-apps' }, chipsApps(permissoesDe(u))),
    acoes,
  );
  if (usuarioEditando === u.id) linha.append(editorPermissoes(u));
  return linha;
}

// ---------- convites ----------

function linhaConvite(c) {
  return el(
    'div',
    { class: 'linha-conta' },
    el(
      'div',
      { class: 'conta-identidade' },
      el('div', { class: 'conta-nome' }, c.nome ?? '—'),
      el('div', { class: 'conta-email' }, c.email),
      el('div', { class: 'conta-meta' }, `#${c.id} · criado ${dataCurta(c.criado_em)} · expira ${expiraEm(c.expira_em)} (${dataCurta(c.expira_em)})`),
    ),
    el('div', { class: 'conta-apps' }, chipsApps(permissoesDe(c))),
    el(
      'div',
      { class: 'contas-acoes' },
      botaoAcao('reenviar', async () => {
        const r = await executarAcao(`reenviar convite para ${c.email}`, 'POST', `/api/contas/convites/${c.id}/reenviar`);
        if (r?.ok) { ultimoConvite = r.dados.convite; desenharContas(); }
      }, { title: 'gera link novo (o antigo deixa de valer) e manda o e-mail de novo' }),
      botaoAcao('revogar', async () => {
        if (!confirm(`Revogar o convite de ${c.email}? O link deixa de funcionar.`)) return;
        const r = await executarAcao(`revogar convite de ${c.email}`, 'DELETE', `/api/contas/convites/${c.id}`);
        // A caixa "copiar link" mostrava um link que acabou de morrer.
        if (r?.ok && ultimoConvite?.id === c.id) { ultimoConvite = null; desenharContas(); }
      }, { perigo: true }),
    ),
  );
}

// ---------- formulário "Convidar" ----------

function resultadoConvite(c) {
  if (!c) return null;
  const caixa = el('div', { class: `contas-resultado${c.enviado ? ' ok' : ' erro'}` });
  caixa.append(el('p', { class: 'contas-resultado-cab' }, `convite #${c.id} · ${c.email} · expira ${dataCurta(c.expiraEm)}`));
  if (c.enviado) {
    caixa.append(el('p', {}, 'e-mail enviado. ', el('span', { class: 'discreto' }, 'Se não chegar, use "reenviar" na lista ou o link abaixo.')));
  } else {
    caixa.append(el('p', {}, el('strong', {}, 'e-mail NÃO enviado'), ` — ${c.erro ?? 'motivo desconhecido'}. Mande o link por outro canal:`));
  }
  const campo = el('input', { type: 'text', readonly: '', class: 'contas-link', value: c.link ?? '' });
  campo.addEventListener('focus', () => campo.select());
  const copiar = el('button', { type: 'button', class: 'botao-contas' }, 'copiar link');
  copiar.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(c.link ?? '');
      copiar.textContent = 'copiado';
    } catch {
      campo.focus();
      copiar.textContent = 'selecione e copie (Ctrl+C)';
    }
  });
  caixa.append(el('div', { class: 'contas-acoes' }, campo, copiar));
  return caixa;
}

function formularioConvidar() {
  const email = el('input', { type: 'email', name: 'email', required: '', placeholder: 'email@exemplo.com', autocomplete: 'off', class: 'contas-campo' });
  const nome = el('input', { type: 'text', name: 'nome', placeholder: 'nome (opcional)', maxlength: '100', autocomplete: 'off', class: 'contas-campo' });
  const checks = seletoresApps([], 'novo');
  const enviar = el('button', { type: 'submit', class: 'botao-contas destaque' }, 'convidar');
  if (acaoEmCurso) enviar.disabled = true;

  const form = el(
    'form',
    { class: 'contas-form', autocomplete: 'off' },
    el('h3', { class: 'contas-subtitulo' }, 'Convidar'),
    // Sem número: o prazo (CONVITE_DIAS) é do central e pode mudar lá sem
    // ninguém tocar aqui; a data real vem na resposta (`expiraEm`) e aparece
    // na caixa de resultado.
    el('p', { class: 'discreto' }, 'Cria o convite e manda o e-mail. A pessoa escolhe a senha no link, que expira (o prazo é o do central; a data aparece no resultado).'),
    el('label', { class: 'contas-rotulo' }, 'e-mail', email),
    el('label', { class: 'contas-rotulo' }, 'nome', nome),
    el('div', { class: 'contas-rotulo' }, 'apps e papéis', checks),
    el('div', { class: 'contas-acoes' }, enviar),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const corpo = { email: email.value.trim(), nome: nome.value.trim() || undefined, apps: appsMarcados(checks, 'novo') };
    if (!corpo.apps.length && !confirm('Nenhum app marcado: a pessoa vai conseguir entrar, mas não vai ver nenhum app com SSO. Convidar assim mesmo?')) return;
    const r = await executarAcao(`convidar ${corpo.email}`, 'POST', '/api/contas/convites', corpo);
    if (r?.ok) { ultimoConvite = r.dados.convite; desenharContas(); }
  });
  return form;
}

// ---------- a aba ----------

function secao(titulo, contagem, filhos, vazio) {
  return el(
    'section',
    { class: 'contas-secao' },
    el('div', { class: 'contas-secao-cab' }, el('h3', { class: 'contas-subtitulo' }, titulo), el('span', { class: 'selo-contagem' }, String(contagem))),
    ...(filhos.length ? filhos : [el('p', { class: 'discreto' }, vazio)]),
  );
}

function desenharContas() {
  const recarregar = botaoAcao('recarregar', carregarContas);
  if (statusContas?.tipo === 'andamento') recarregar.disabled = true;

  const cabecalho = el(
    'div',
    { class: 'decisoes-cabecalho' },
    el(
      'div',
      {},
      el('p', { class: 'pagina-kicker' }, 'PROTOCOLO · 05 / ACESSO'),
      el('h2', { class: 'titulo-secao' }, 'Contas'),
      el('p', { class: 'kicker' }, 'cadastro único do astargne.com · cada ação roda no servidor por ssh · o token nunca sai de lá'),
    ),
    el('div', { class: 'contas-cab-direita' }, statusContas ? el('span', { class: `contas-status ${statusContas.tipo}` }, statusContas.texto) : '', recarregar),
  );

  const carregou = appsSso.length > 0 || usuariosContas.length > 0;
  if (!carregou && statusContas?.tipo !== 'ok') {
    abaContasEl.replaceChildren(cabecalho, el('p', { class: 'discreto' }, statusContas?.tipo === 'erro' ? 'sem dado — veja o erro acima e tente "recarregar".' : 'carregando…'));
    return;
  }

  const ativos = usuariosContas.filter((u) => u.ativo).length;
  const principal = el(
    'div',
    { class: 'contas-principal' },
    secao(`Usuários · ${ativos} ativos`, usuariosContas.length, usuariosContas.map(linhaUsuario), 'nenhum usuário cadastrado.'),
    secao('Convites pendentes', convitesContas.length, convitesContas.map(linhaConvite), 'nenhum convite pendente.'),
  );
  const lateral = el('div', { class: 'contas-lateral' }, formularioConvidar(), resultadoConvite(ultimoConvite) ?? '');

  abaContasEl.replaceChildren(cabecalho, el('div', { class: 'grid-contas' }, principal, lateral));
}
