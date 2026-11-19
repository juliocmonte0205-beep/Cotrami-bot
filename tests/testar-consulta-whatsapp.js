'use strict';
const assert = require('node:assert/strict');
const ChatbotService = require('../src/services/ChatbotService');
const MenuService = require('../src/services/MenuService');
const SessionManager = require('../src/managers/SessionManager');

const registro = {
  linha: 'Itaitinga–Fortaleza', data: '2026-11-20',
  registros: [{carro:'16', viagens:[{itaitinga:'06:00', fortaleza:'07:20',ordemViagem:1}]},
             {carro:'22', viagens:[{itaitinga:'06:30',fortaleza:'07:50',ordemViagem:1}]}]
};
const escalas = {listar:()=>[{...registro,status:'rascunho',data:'2026-11-19'}, {...registro,status:'publicada'}]};
const bot = new ChatbotService(new MenuService(),new SessionManager(), {listar:()=>[]}, escalas);
const id='teste';
const p=mensagem=>bot.processarMensagem(id,mensagem);
assert.match(p('oi'),/CONSULTAR HORÁRIOS/i);
assert.match(p('2'),/DD\/MM\/AAAA/);
assert.match(p('31/02/2026'),/Data inválida/);
assert.match(p('19/11/2026'),/não há escala \*publicada\*/i);
assert.match(p('20/11/2026'),/ESCALA PUBLICADA/);
assert.match(p('1'),/Carro 16/);
assert.match(p('06:00'),/Carro 16/);
assert.doesNotMatch(p('06:00'),/Carro 22/);
assert.match(p('data'),/DD\/MM\/AAAA/);
assert.match(p('20/11/2026'),/ESCALA PUBLICADA/);
assert.match(p('2'),/07:20/);
assert.match(p('0'),/Atendimento Virtual/);
// Se despublicar a escala entre a seleção da data e a resposta, ela não vaza.
assert.match(p('2'),/DD\/MM\/AAAA/);
assert.match(p('20/11/2026'),/ESCALA PUBLICADA/);
escalas.listar=()=>[{...registro,status:'rascunho'}];
assert.match(p('1'),/não está mais publicada/);
console.log('OK: somente escalas publicadas, datas válidas, origens e filtro por horário.');
