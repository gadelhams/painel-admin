// Um GET HTTPS com teto de tempo. Não escolhe qual serviço sondar.

import https from 'node:https';

export class SondaHttps {
  pedir(url, conferirCorpo) {
    return new Promise((resolve) => {
      const inicio = Date.now();
      const req = https.get(url, { timeout: 6000 }, (res) => {
        const base = { url, status: res.statusCode, ms: Date.now() - inicio };
        const okHttp = res.statusCode < 500;
        if (!conferirCorpo || !okHttp) {
          res.resume();
          return resolve({ ...base, ok: okHttp });
        }
        let corpo = '';
        res.setEncoding('utf8');
        res.on('data', (p) => { if (corpo.length < 8192) corpo += p; });
        res.on('end', () => {
          let dado = null;
          try { dado = JSON.parse(corpo); } catch { /* corpo não-JSON */ }
          const veredito = conferirCorpo(dado);
          resolve({ ...base, ok: veredito.ok, ...(veredito.detalhe ? { detalhe: veredito.detalhe } : {}) });
        });
      });
      req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
      req.on('error', (erro) => resolve({ url, ok: false, erro: erro.message }));
    });
  }
}
