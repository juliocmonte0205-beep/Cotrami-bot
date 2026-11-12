class MessageHandler {
  constructor(client, chatbotService) {
    this.client = client;
    this.chatbotService = chatbotService;
  }

  async processar(msg) {
    try {
      console.log('📩 Mensagem recebida:', msg.from, msg.body);

      if (!msg.from || msg.fromMe || msg.from.endsWith('@g.us')) {
        return;
      }

      if (msg.type !== 'chat') {
        return;
      }

      const resposta = this.chatbotService.processarMensagem(msg.from, msg.body);
      console.log('🤖 Tentando enviar resposta...');

      // Mantém o envio direto que funcionou na versão anterior.
      await this.client.sendMessage(msg.from, resposta);
      console.log('✅ Resposta enviada!');
    } catch (erro) {
      console.error('❌ Erro ao processar mensagem:', erro);
    }
  }
}

module.exports = MessageHandler;
