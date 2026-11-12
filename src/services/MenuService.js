class MenuService {
  constructor() {
    this.menuPrincipal = `🚌 *COTRAMI - Atendimento Virtual*

Olá! Seja bem-vindo ao atendimento virtual da COTRAMI!

Como podemos ajudar você hoje?

1️⃣ Consultar linhas
2️⃣ Consultar horários
3️⃣ Valores das passagens
4️⃣ Consultar itinerários
5️⃣ Outras informações

Digite o número da opção desejada.

Para voltar ao menu, digite *0*.`;

    this.respostas = {
      '1': `🚌 *CONSULTAR LINHAS*

Em breve, você poderá consultar as linhas disponíveis da COTRAMI.

Digite *0* para voltar ao menu principal.`,
      '2': `🕒 *CONSULTAR HORÁRIOS*

Em breve, você poderá consultar os horários dos ônibus por linha e dia da semana.

Digite *0* para voltar ao menu principal.`,
      '3': `💰 *VALORES DAS PASSAGENS*

As tarifas serão disponibilizadas após a confirmação dos valores oficiais.

Digite *0* para voltar ao menu principal.`,
      '4': `📍 *ITINERÁRIOS*

Em breve, você poderá consultar os trajetos e as principais paradas das linhas.

Digite *0* para voltar ao menu principal.`,
      '5': `ℹ️ *OUTRAS INFORMAÇÕES*

Este espaço será utilizado para informações sobre serviços, benefícios e avisos da COTRAMI.

Digite *0* para voltar ao menu principal.`,
    };
  }

  obterMenuPrincipal() {
    return this.menuPrincipal;
  }

  possuiOpcao(opcao) {
    return Object.prototype.hasOwnProperty.call(this.respostas, opcao);
  }

  obterResposta(opcao) {
    return this.respostas[opcao];
  }

  obterMensagemInvalida() {
    return `❌ *Opção não reconhecida.*

Digite um número de *1 a 5* para selecionar uma opção.

Ou digite *0* para voltar ao menu principal.`;
  }
}

module.exports = MenuService;
