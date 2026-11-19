'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Achados = require('../src/data/AchadosPerdidos');
const Chatbot = require('../src/services/ChatbotService');
const Menu = require('../src/services/MenuService');
const MessageHandler = require('../src/handlers/MessageHandler');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cotrami-copy-'));
async function main() {
  try {
    const achados = new Achados(path.join(dir, 'ocorrencias.json'));
    const sessions = new Map();
    const session = { definir:(u,v)=>sessions.set(u,v), obter:u=>sessions.get(u), existe:u=>sessions.has(u) };
    const bot = new Chatbot(new Menu(), session, { listar:()=>[] }, {listar:()=>[]}, achados);
    const usuario='5511999990000@c.us', outro='5511999991111@c.us';
    const criados = [];
    for (let i=0; i<7; i++) criados.push(achados.criar({usuario,tipo:'perdido',descricao:`objeto ${i}`,quando:'hoje',carro:'18'}));
    const oculto = achados.criar({usuario:outro,tipo:'perdido',descricao:'objeto secreto',quando:'hoje',carro:'19'});
    const primeiraPagina = bot.processarMensagem(usuario,'7');
    assert.match(primeiraPagina,/Página 1\/2/);
    assert.match(primeiraPagina,/Protocolo: `AP-/);
    assert.doesNotMatch(primeiraPagina,new RegExp(oculto.protocolo));
    assert.match(bot.processarMensagem(usuario,'mais'),/Página 2\/2/);
    assert.match(bot.processarMensagem(usuario,'anterior'),/Página 1\/2/);
    const detalhes = bot.processarMensagem(usuario,'1');
    assert.match(detalhes,/ACOMPANHAMENTO/);
    let extras=bot.consumirMensagensExtras(usuario);
    assert.equal(extras.length,1);
    assert.match(extras[0],/^AP-[A-F0-9]{12}$/);
    assert.deepEqual(bot.consumirMensagensExtras(usuario),[]);
    assert.match(bot.processarMensagem(outro,'7'),new RegExp(oculto.protocolo));
    assert.doesNotMatch(bot.processarMensagem(outro,'7'),new RegExp(criados[0].protocolo));
    assert.match(bot.processarMensagem(outro,criados[0].protocolo),/não encontrada/);
    // Integração real do handler: duas mensagens no WhatsApp após criar ocorrência.
    const saidas=[];
    const handler = new MessageHandler({sendMessage:async(u,m)=>saidas.push({u,m})},bot);
    const send= async txt=>handler.processar({from:usuario,fromMe:false,type:'chat',body:txt});
    await send('0'); await send('6'); await send('1'); await send('mochila de teste');
    await send('18/11 08:00'); await send('não sei');
    const count = saidas.length;
    await send('1');
    assert.equal(saidas.length,count+2);
    assert.match(saidas.at(-2).m,/OCORRÊNCIA REGISTRADA/);
    assert.match(saidas.at(-1).m,/^AP-[A-F0-9]{12}$/);
    assert.equal(saidas.at(-1).u,usuario);
    console.log('OK: códigos na lista, paginação, privacidade e protocolo em mensagem separada no WhatsApp.');
  } finally { fs.rmSync(dir,{recursive:true,force:true}); }
}
main().catch(e=>{console.error(e);process.exitCode=1});
