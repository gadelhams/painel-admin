import test from 'node:test';
import assert from 'node:assert/strict';
import { resumirDecisoes } from '../decisoes-c3po.js';

const decisoes = [
  { identificador: 'CAD-1', projeto: 'CadastroUnico', texto: 'Publicar a Fase 2', tag: 'BLOQUEADA', detalhe: 'espera o "vai" do dono', estado: 'aberto' },
  { identificador: 'ANYA-42', projeto: 'Anya', texto: 'Re-extrair', tag: 'BLOQUEADA', detalhe: 'arquivos do autor', estado: 'aberto' },
  { identificador: 'ALEXA-3', projeto: 'alexa youtube', texto: 'Parser', tag: 'BLOQUEADA', detalhe: 'aguarda <strong>youtubei.js</strong> corrigir', estado: 'aberto' },
  { identificador: 'FILO-9', projeto: 'ProjetoConversaComDeus', texto: 'Rotacionar chaves', tag: 'ASTARGNE', estado: 'aberto' },
  { identificador: 'CAD-18', projeto: 'CadastroUnico', texto: 'Trocar Brevo', tag: 'ASTARGNE', estado: 'aberto' },
  { identificador: 'CAD-2', projeto: 'CadastroUnico', texto: 'Autorizar o push', tag: 'ASTARGNE', estado: 'aberto' },
  { identificador: 'CKBL-50', projeto: 'CK3BannerLord', texto: 'Precificar apoio', tag: 'PÓS-PLAYTEST', estado: 'aberto' },
  { identificador: 'CKBL-46', projeto: 'CK3BannerLord', texto: 'Aceite do banquete', tag: 'EMPÍRICA', estado: 'aberto' },
  { identificador: 'EMU-6', projeto: 'EmuladorWeb', texto: 'Teste touch em celular real', tag: 'TAREFA DONO', estado: 'aberto' },
  { identificador: 'OLD-1', projeto: '_oldSistemaLoreEngine', texto: 'coisa congelada', tag: 'ASTARGNE', estado: 'aberto' },
  { identificador: 'X-1', projeto: 'Anya', texto: 'fechada', tag: 'ASTARGNE', estado: 'resolvido' },
];
const projetos = [{ pasta: '_oldSistemaLoreEngine', titulo: 'Lore (congelado)', congelado: true }, { pasta: 'CadastroUnico', titulo: 'CadastroUnico' }];
const chaves = { pendentes: [{ card: 'CAD-18' }], rotacoesFeitas: [{ card: 'FILO-9' }] };

test('resumo para o C-3PO: separa dono, cadeias do dono, terceiros, rotação registrada, ignora congelado e fechadas', () => {
  const r = resumirDecisoes({ decisoes, projetos, chaves });
  assert.deepEqual(r.projetosCongeladosIgnorados, ['_oldSistemaLoreEngine']);
  assert.equal(r.totais.dono_chaves, 1);
  assert.equal(r.totais.rotacao_registrada, 1);
  assert.equal(r.totais.dono_push, 1);
  assert.equal(r.totais.dono_provas, 2, 'EMPÍRICA e TAREFA DONO são tarefa do dono, não decisão de produto');
  assert.equal(r.totais.bloqueada_pelo_dono, 1);
  assert.equal(r.totais.bloqueada_por_terceiro, 2);
  assert.equal(r.totais.pos_playtest, 1);
  assert.match(r.grupos.bloqueada_por_terceiro[1], /aguarda youtubei\.js corrigir/, 'html do detalhe some');
  assert.equal(JSON.stringify(r).includes('congelada'), false);
  assert.equal(JSON.stringify(r).includes('X-1'), false);
  const so = resumirDecisoes({ decisoes, projetos, chaves, foco: 'CadastroUnico' });
  assert.equal(so.totais.bloqueada_por_terceiro, 0);
  assert.equal(so.totais.bloqueada_pelo_dono, 1);
});
