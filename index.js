const WhatsAppBot = require('./src/bot/WhatsAppBot');
const SessionManager = require('./src/managers/SessionManager');
const MenuService = require('./src/services/MenuService');
const ChatbotService = require('./src/services/ChatbotService');
const Database = require('./src/data/Database');
const { iniciarApi } = require('./src/api/server');

const db = new Database();
const sessionManager = new SessionManager();
const menuService = new MenuService();
const chatbotService = new ChatbotService(menuService, sessionManager, db);
const bot = new WhatsAppBot(chatbotService);
iniciarApi();
bot.iniciar().catch((erro) => console.error('❌ Erro ao iniciar o chatbot:', erro));
