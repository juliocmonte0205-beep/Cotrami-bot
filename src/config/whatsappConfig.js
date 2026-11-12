const { LocalAuth } = require('whatsapp-web.js');

function criarConfiguracaoWhatsApp() {
  return {
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: '/usr/bin/google-chrome-stable',
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    },
  };
}

module.exports = criarConfiguracaoWhatsApp;
