const { LocalAuth } = require('whatsapp-web.js');

function criarConfiguracaoWhatsApp() {
  return {
    authStrategy: new LocalAuth(),
    puppeteer: {
      // Defina CHROME_PATH para usar o Chrome em outro caminho (ex.: no Windows).
      executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
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
