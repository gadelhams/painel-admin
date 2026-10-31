// A sequência de escrita de UM veredito do zelador e a reconciliação do que ficou pela metade: PENDENTE → intenção → mudança sob a trava → verificação → recibo → APLICADO. Não chama a CLI.
//
// Ordem (J26–J28, J53, J57, J58, J62–J65 do plano e do parecer de 31/10/2026):
// 1. tudo reconferido AO VIVO antes de escrever: o que não se toca, a digital (J24), o ato
//    humano (J57) e a prontidão de todas as cartas (J58);
// 2. diário PENDENTE no índice fora da rotação; 3. comentário de intenção, com o `external_id`
//    da mudança estruturada + digital de antes; 4. a mudança SOB a trava global (J64), com o
//    fencing do lease (J53), sem lease nem tentativa de despacho na carta e com a digital
//    reconferida logo antes do PATCH (J63); 5. verificação só dos campos escritos (J65);
//    6. recibo; 7. RESOLVIDO. Divergência suspende o play do projeto (J66) depois do recibo
//    (o escritor só escreve com o play ligado); a reconciliação de um recibo DIVERGENTE
//    garante a suspensão se o processo caiu entre os dois.
// Queda entre 3 e 6: o próximo job do projeto acha o PENDENTE e rola para a frente (mudança já
// feita → recibo; carta igual → aplica com as mesmas checagens) ou grava recibo ABORTADO.
import { digitalDaCarta, ehZelador, motivoIntocavel, nomesDe, prontidaoDoProjeto, reversas, violaAtoHumano, violaProntidao } from './zelador-politica.js';
import { chaveDaMudanca, htmlIntencao, htmlRecibo, novaDescricao } from './zelador-veredito.js';
import { ORIGEM_ZELADOR } from './escritor-zelador-plane.js';
import { listar } from './zelador-retrato.js';

const DIA_MS = 24 * 60 * 60_000;
const abortar = motivo => Object.assign(new Error(motivo), { abortar: true });

// A carta depois da mudança, para a prontidão simulada.
function aplicarNaCopia(carta, mudanca, { descricaoNova, estados }) {
  const copia = { ...carta, labels: [...(carta.labels ?? [])] };
  if (mudanca.tipo === 'estado') {
    const grupos = mudanca.grupo === 'completed' ? ['completed'] : ['cancelled', 'canceled'];
    const alvo = estados.find(e => grupos.includes(e.group)) ?? { id: 'simulado', name: mudanca.grupo, group: mudanca.grupo };
    copia.state = { id: alvo.id, name: alvo.name, group: alvo.group };
  } else if (mudanca.tipo === 'labels') {
    copia.labels = [...copia.labels.filter(l => !mudanca.remover.includes(l.name)), ...mudanca.adicionar.map(name => ({ id: `nova-${name}`, name }))];
  } else copia.description_html = descricaoNova;
  return copia;
}

function jaAplicada(carta, mudanca, descricaoNova) {
  if (mudanca.tipo === 'estado') return (mudanca.grupo === 'completed' ? ['completed'] : ['cancelled', 'canceled']).includes(carta.state?.group);
  if (mudanca.tipo === 'labels') { const n = nomesDe(carta); return mudanca.adicionar.every(x => n.includes(x)) && mudanca.remover.every(x => !n.includes(x)); }
  return carta.description_html === descricaoNova;
}

export class AplicacaoZelador {
  constructor({ job }) { this.j = job; }

  get projetoId() { return this.j.projeto.plane; }

  // Lê a carta e o projeto de novo e diz se a mudança ainda pode ser escrita. Lança `abortar`.
  async conferirAoVivo(cartaId, mudanca, digitalAntes) {
    const { retrato, projeto, agora } = this.j;
    const { cartas, porId } = await retrato.cartasDoProjeto(projeto);
    const carta = porId.get(cartaId);
    if (!carta) throw abortar('carta sumiu do Plane');
    const d = await retrato.detalhes(this.projetoId, cartaId);
    const motivo = motivoIntocavel(carta, { porId, ...d, agoraMs: agora() });
    if (motivo) throw abortar(motivo);
    if (digitalDaCarta(carta, d.comentarios) !== digitalAntes) throw abortar('a carta mudou desde o retrato');
    let descricaoNova = null;
    if (mudanca.tipo === 'trecho' || mudanca.tipo === 'anexar') {
      try { descricaoNova = novaDescricao(carta.description_html, mudanca); } catch (e) { throw abortar(e.message); }
    }
    const humano = violaAtoHumano(carta, mudanca, { atividades: d.atividades, estados: this.j.estados, novaDescricao: descricaoNova });
    if (humano) throw abortar(humano);
    // J58: o universo é toda carta aberta mais as que esperam por esta (abertas ou não).
    const abertas = cartas.filter(c => !['completed', 'cancelled', 'canceled'].includes(c.state?.group));
    const relacoesPorId = new Map([[cartaId, d.relacoes]]);
    const universo = new Map(abertas.map(c => [c.id, c]));
    for (const r of reversas(d.relacoes)) if (porId.has(r)) universo.set(r, porId.get(r));
    universo.set(cartaId, carta);
    for (const id of universo.keys()) {
      if (relacoesPorId.has(id)) continue;
      relacoesPorId.set(id, await this.j.consultar(`/projects/${this.projetoId}/work-items/${id}/relations/`).catch(() => null));
    }
    const antes = prontidaoDoProjeto([...universo.values()], relacoesPorId, porId);
    const copia = aplicarNaCopia(carta, mudanca, { descricaoNova, estados: this.j.estados });
    const porIdDepois = new Map(porId); porIdDepois.set(cartaId, copia);
    const depois = prontidaoDoProjeto([...universo.values()].map(c => (c.id === cartaId ? copia : c)), relacoesPorId, porIdDepois);
    const prontidao = violaProntidao(antes, depois, cartaId);
    if (prontidao) throw abortar(prontidao);
    return { carta, descricaoNova };
  }

  // Comentário (intenção ou recibo) sob a trava, com o fencing do lease (J53).
  comentarSobFencing(cartaId, html, externalId) {
    return this.j.sobFencing(() => this.j.escritor.comentar({ projetoId: this.projetoId, cartaId, html, externalId }));
  }

  async aplicar(v) {
    const carta = this.j.r.porIdentificador.get(v.identificador);
    const digitalAntes = this.j.r.digitais.get(carta.id);
    let conferida;
    try { conferida = await this.conferirAoVivo(carta.id, v.mudanca, digitalAntes); }
    catch (erro) { if (erro.abortar) return { resultado: 'MANTER', motivo: erro.message }; throw erro; }
    const chave = chaveDaMudanca(carta.id, v.mudanca, digitalAntes);
    const html = htmlIntencao({ veredito: v.veredito, chave, comentario: v.comentario, evidencias: v.evidencias, mudanca: v.mudanca });
    const pendente = { chave, projetoId: this.projetoId, cartaId: carta.id, carta: v.identificador, veredito: v.veredito, mudanca: v.mudanca,
      digitalAntes, descricaoNova: conferida.descricaoNova, jobId: this.j.jobId };
    await this.j.diario.marcarPendente(pendente);
    await this.comentarSobFencing(carta.id, html, chave);
    return this.efetivar(pendente);
  }

  // Passo 4 em diante. Também é o rolar-para-frente da reconciliação.
  async efetivar(p) {
    const { estado, escritor, play, diario } = this.j;
    let resultado;
    let motivo = null;
    try {
      const r = await this.j.sobFencing(async () => {
        // J64: o despacho reserva sob esta mesma trava; aqui nenhum dos dois cruza o outro.
        if (await estado.lerLease(p.cartaId).catch(() => ({ ilegivel: true }))) throw abortar('lease de despacho apareceu na carta');
        const historico = await estado.lerHistorico(p.cartaId).catch(() => null);
        if (!historico || historico.some(e => e.tipo === 'TENTATIVA' && this.j.agora() - Date.parse(e.quando) < DIA_MS)) throw abortar('tentativa de despacho na carta');
        const feito = await escritor.mudar({ projetoId: p.projetoId, cartaId: p.cartaId, mudanca: p.mudanca, descricaoNova: p.descricaoNova,
          conferirAntes: async (cartaLida) => {
            const comentarios = await listar(this.j.consultar, `/projects/${p.projetoId}/work-items/${p.cartaId}/comments/`);
            if (digitalDaCarta(cartaLida, comentarios) !== p.digitalAntes) throw abortar('a carta mudou entre a intenção e a mudança');
          } });
        return feito;
      });
      resultado = r.conferiu ? 'APLICADO' : 'DIVERGENTE';
      if (!r.conferiu) motivo = 'a releitura não conferiu; play do projeto suspenso';
    } catch (erro) {
      if (!erro.abortar) throw erro;
      resultado = 'ABORTADO';
      motivo = erro.message;
    }
    await this.comentarSobFencing(p.cartaId, htmlRecibo({ chave: p.chave, resultado, motivo }), `${p.chave}:recibo:${resultado}`);
    if (resultado === 'DIVERGENTE') await this.j.comTrava(() => play.suspenderSobTrava(p.projetoId, `divergência na verificação de ${p.carta}`));
    await diario.resolver(p.chave, resultado, { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, veredito: p.veredito, ...(motivo ? { motivo } : {}) });
    return { resultado, motivo };
  }

  // J62: o PENDENTE deste projeto que um job anterior deixou.
  async reconciliar(p) {
    const comentarios = await listar(this.j.consultar, `/projects/${p.projetoId}/work-items/${p.cartaId}/comments/`);
    const doZelador = comentarios.filter(c => ehZelador(c) && c.external_source === ORIGEM_ZELADOR);
    const recibo = doZelador.filter(c => String(c.external_id ?? '').startsWith(`${p.chave}:recibo:`)).at(-1);
    if (recibo) {
      const resultado = String(recibo.external_id).split(':').at(-1);
      if (resultado === 'DIVERGENTE') await this.j.comTrava(() => this.j.play.suspenderSobTrava(p.projetoId, `divergência na verificação de ${p.carta}`));
      await this.j.diario.resolver(p.chave, resultado, { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, reconciliado: true });
      return { resultado, reconciliado: 'recibo já gravado' };
    }
    if (!doZelador.some(c => c.external_id === p.chave)) {
      await this.j.diario.resolver(p.chave, 'ABORTADO_SEM_ESCRITA', { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, reconciliado: true });
      return { resultado: 'ABORTADO_SEM_ESCRITA', reconciliado: 'a intenção não chegou ao Plane' };
    }
    const { porId } = await this.j.retrato.cartasDoProjeto(this.j.projeto);
    const carta = porId.get(p.cartaId);
    if (carta && jaAplicada(carta, p.mudanca, p.descricaoNova)) {
      await this.comentarSobFencing(p.cartaId, htmlRecibo({ chave: p.chave, resultado: 'APLICADO' }), `${p.chave}:recibo:APLICADO`);
      await this.j.diario.resolver(p.chave, 'APLICADO', { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, reconciliado: true });
      return { resultado: 'APLICADO', reconciliado: 'mudança já estava feita' };
    }
    try { await this.conferirAoVivo(p.cartaId, p.mudanca, p.digitalAntes); }
    catch (erro) {
      if (!erro.abortar) throw erro;
      await this.comentarSobFencing(p.cartaId, htmlRecibo({ chave: p.chave, resultado: 'ABORTADO', motivo: erro.message }), `${p.chave}:recibo:ABORTADO`);
      await this.j.diario.resolver(p.chave, 'ABORTADO', { projetoId: p.projetoId, cartaId: p.cartaId, carta: p.carta, motivo: erro.message, reconciliado: true });
      return { resultado: 'ABORTADO', reconciliado: erro.message };
    }
    return { ...(await this.efetivar(p)), reconciliado: 'rolou para a frente' };
  }
}
