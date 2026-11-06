// Confere Host e origem de todo pedido, antes do portão de login e das rotas; não sabe de sessão.
//
// O painel é alcançável de dois jeitos: loopback, sem login (quem está na máquina lê tudo e
// conversa com o C-3PO), e a borda do tailnet, que desde 06/11/2026 deixa passar todo
// aparelho menos o racknerd e onde o portão (http/portao-borda.js) exige a sessão do dono.
// Mudar estado pede, além disso, o autorizador de cada rota. Esta guarda fecha o que sobra:
//
// - Host fora da lista: DNS rebinding (um site cujo nome passa a apontar
//   para 127.0.0.1 lê e aciona o painel como se fosse "mesma origem").
// - Método que muda estado vindo de outro site: CSRF. Um POST text/plain de
//   qualquer aba aberta chega aqui sem preflight; o navegador sempre o marca
//   com Sec-Fetch-Site e Origin, e é isso que se confere. Requisição sem
//   nenhum dos dois não veio de navegador (curl na própria máquina) e passa.

export const NOME_BORDA = 'painel.vpn.astargne.com';

const METODOS_SEGUROS = new Set(['GET', 'HEAD']);

export function criarGuarda(porta) {
  const hosts = new Set([`127.0.0.1:${porta}`, `localhost:${porta}`, NOME_BORDA]);
  const origens = new Set([`http://127.0.0.1:${porta}`, `http://localhost:${porta}`, `https://${NOME_BORDA}`]);

  // Devolve null quando a requisição pode seguir, ou { status, erro }.
  return function recusa({ metodo, host, origem, secFetchSite }) {
    if (!hosts.has((host ?? '').toLowerCase())) return { status: 421, erro: 'host não atendido' };
    if (METODOS_SEGUROS.has(metodo)) return null;
    if (secFetchSite !== undefined && secFetchSite !== 'same-origin') return { status: 403, erro: 'origem recusada' };
    if (origem !== undefined && !origens.has(origem)) return { status: 403, erro: 'origem recusada' };
    return null;
  };
}
