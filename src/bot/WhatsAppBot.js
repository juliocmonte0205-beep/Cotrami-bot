const qrcode = require('qrcode-terminal');
const { Client } = require('whatsapp-web.js');
const criarConfiguracaoWhatsApp = require('../config/whatsappConfig');
const MessageHandler = require('../handlers/MessageHandler');

class WhatsAppBot {
  constructor(chatbotService) {
    this.client = new Client(criarConfiguracaoWhatsApp());
    this.messageHandler = new MessageHandler(this.client, chatbotService);
    this.registrarEventos();
  }

  registrarEventos() {
    this.client.on('qr', (qr) => {
      console.log('📲 Escaneie o QR Code abaixo:');
      qrcode.generate(qr, { small: true });
    });

    this.client.on('authenticated', () => {
      console.log('🔐 WhatsApp autenticado!');
    });

    this.client.on('ready', () => {
      console.log('✅ COTRAMI Bot conectado ao WhatsApp!');
    });

    this.client.on('auth_failure', (mensagem) => {
      console.error('❌ Falha na autenticação:', mensagem);
    });

    this.client.on('disconnected', (motivo) => {
      console.log('⚠️ WhatsApp desconectado:', motivo);
    });

    this.client.on('message', async (msg) => {
      await this.messageHandler.processar(msg);
    });
  }

  async iniciar() {
    console.log('🚀 Iniciando COTRAMI Bot...');
    await this.client.initialize();
  }
}

module.exports = WhatsAppBot;
