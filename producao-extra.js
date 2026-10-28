// Sondas de produção que não pertencem a um projeto do catálogo.

export function conferirEscutaDoSSO(dado) {
  if (!dado || typeof dado !== 'object') return { ok: false, detalhe: 'resposta ilegível' };
  const escuta = dado.escuta;
  if (!escuta || typeof escuta.ligados !== 'number' || typeof escuta.esperados !== 'number') {
    return { ok: dado.ok === true, detalhe: 'release sem relatório de escuta' };
  }
  if (escuta.ligados < escuta.esperados) {
    return {
      ok: false,
      detalhe: `escutando em ${escuta.ligados} de ${escuta.esperados} endereços — o filosofia não valida sessão`,
    };
  }
  return { ok: dado.ok === true };
}

export const PRODUCAO_EXTRA = [
  { rotulo: 'Caddy do host (astargne.com)', url: 'https://astargne.com' },
  {
    rotulo: 'Cadastro Único — escuta',
    url: 'https://astargne.com/saude',
    conferirCorpo: conferirEscutaDoSSO,
  },
];
