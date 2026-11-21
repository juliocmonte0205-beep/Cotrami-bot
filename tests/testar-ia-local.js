'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const IAService = require('../src/services/IAService');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '../data/EscalasImportadas') return class EscalasFake {};
  if (request === '../data/AchadosPerdidos') return class AchadosFake {};
  return originalLoad.apply(this, arguments);
};
const ChatbotService = require('../src/services/ChatbotService');
Module._load = originalLoad;
const MessageHandler = require('../src/handlers/MessageHandler');

function bot(ia, escalas = []) {
  const states = new Map();
  const sessions = {
    definir: (u, s) => states.set(u,s),
    obter: u => states.get(u),
    existe: u => states.has(u)
  };
  const menu = {
    obterMenuPrincipal: () => 'MENU PRINCIPAL',
    possuiOpcao: () => false,
    obterMensagemInvalida: () => 'OPÇÃO INVÁLIDA',
    obterResposta: () => 'RESPOSTA'
  };
  const database = {listar: t => t === 'linhas' ? [{nome:'Itaitinga-Fortaleza',origem:'Itaitinga',destino:'Fortaleza'}] : []};
  const achados = {listar: () => [], porUsuario:()=>null, criar:()=>({protocolo:'AP-123456789ABC'})};
  return new ChatbotService(menu, sessions, database, {listar:()=>escalas}, achados, ia);
}
async function run() {
  const ia = new IAService({ fetchFn: async () => ({ok:true, json: async()=>({response:'{"intencao":"consultar_horarios"}'})}) });
  assert.equal(await ia.classificar('Perdi minha mochila na topic'), 'achados_perdido');
  assert.equal(await ia.classificar('Encontrei um celular na topique'), 'achados_encontrado');
  assert.equal(await ia.classificar('Qual é o horário do ônibus?'), 'consultar_horarios');
  assert.equal(await ia.classificar('Oi, preciso de alguma ajuda'), 'consultar_horarios');
  assert.throws(()=>new IAService({endpoint:'https://example.com'}), /endereço HTTP local/);

  const chatbot = bot(ia, [{status:'rascunho',data:'2026-11-20',linha:'Itaitinga–Fortaleza'}]);
  const u = '111@c.us';
  let resp = await chatbot.processarMensagemComIA(u,'Esqueci minha mochila na topic');
  assert.match(resp,/Entendi que você perdeu/);
  assert.match(resp,/Descreva o objeto/);
  assert.equal(chatbot.sessionManager.obter(u),'achados_descricao');
  resp = await chatbot.processarMensagemComIA(u,'mochila preta com dois bolsos');
  assert.match(resp,/Quando/);
  assert.equal(chatbot.sessionManager.obter(u),'achados_quando');
  assert.equal(await chatbot.processarMensagemComIA(u,'0'),'MENU PRINCIPAL');
  assert.match(await chatbot.processarMensagemComIA(u,'quero ver meu protocolo'),/MEUS PROTOCOLOS/);
  assert.equal(await chatbot.processarMensagemComIA(u,'0'),'MENU PRINCIPAL');
  assert.match(await chatbot.processarMensagemComIA(u,'Quando sai a topic?'),/DD\/MM\/AAAA/);
  assert.match(await chatbot.processarMensagemComIA(u,'20/11/2026'),/Não há escala \*publicada\*/);
  const semIA = bot({ativo:false, classificar(){throw Error('nao deveria chamar');}});
  assert.equal(await semIA.processarMensagemComIA(u,'0'),'MENU PRINCIPAL');

  const falha = bot({ativo:true, classificar:async()=>{throw Error('desligado');}});
  assert.equal(await falha.processarMensagemComIA(u,'0'),'MENU PRINCIPAL');
  assert.equal(await falha.processarMensagemComIA(u,'frase sem classificador'),'OPÇÃO INVÁLIDA');

  const enviados = [];
  const handler = new MessageHandler({sendMessage:async(_,msg)=>enviados.push(msg)}, {
    processarMensagemComIA:async()=> 'TESTE ASSÍNCRONO',
    consumirMensagensExtras:()=>['AP-123456789ABC']
  });
  await handler.processar({from:'111@c.us',body:'mensagem de teste',type:'chat',fromMe:false});
  assert.deepEqual(enviados,['TESTE ASSÍNCRONO','AP-123456789ABC']);
  console.log('OK: roteamento com IA local, formulários preservados, rascunhos ocultos, fallback e envio assíncrono.');
}
run().catch(e=>{console.error(e); process.exitCode=1;});
