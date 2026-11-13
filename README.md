# 🚌 Cotrami Bot

**Sistema de atendimento automatizado via WhatsApp e gerenciamento de informações operacionais de transporte.**

## 📌 Sobre o projeto

O Cotrami Bot é um projeto em desenvolvimento que busca facilitar o acesso a informações de transporte e oferecer ferramentas administrativas para organização de linhas, veículos e viagens.

O sistema combina um chatbot para WhatsApp, uma API REST desenvolvida com Express.js e um painel administrativo web.

O código é organizado em módulos para facilitar a manutenção e o desenvolvimento colaborativo.

## 🛠️ Tecnologias

- **JavaScript e Node.js** — desenvolvimento e execução da aplicação.
- **Express.js** — API REST e disponibilização do painel web.
- **whatsapp-web.js** — integração com WhatsApp Web.
- **Puppeteer / Google Chrome** — automação do navegador.
- **Moment Timezone** — suporte a datas e fusos horários.
- **OpenAI SDK** — dependência disponível para futuras integrações ou recursos de IA.
- **Git e GitHub** — controle de versão e colaboração.

## ✅ Funcionalidades implementadas

### Administração

- Autenticação de usuários.
- Perfis de administrador e cooperado.
- Cadastro de usuários por administradores.
- Cadastro, consulta, edição e exclusão de linhas.
- Cadastro, consulta, edição e exclusão de veículos.
- Cadastro, consulta, edição e exclusão de viagens.
- Validação de conflitos de veículos em viagens com mesma data e horário.

### API pública

- Consulta de linhas disponíveis.
- Consulta de viagens por data.
- Retorno de informações operacionais sem exposição de dados dos usuários administrativos.

### WhatsApp

- Inicialização do bot com `whatsapp-web.js`.
- Autenticação local com `LocalAuth`.
- Organização do atendimento em serviços, gerenciadores e manipuladores de mensagens.

## 📁 Estrutura do projeto

```text
Cotrami-bot/
├── index.js
├── package.json
├── package-lock.json
├── public/
│   └── index.html
├── scripts/
│   └── criar-admin.js
└── src/
    ├── api/
    │   └── server.js
    ├── bot/
    │   └── WhatsAppBot.js
    ├── config/
    │   └── whatsappConfig.js
    ├── data/
    │   └── Database.js
    ├── handlers/
    │   └── MessageHandler.js
    ├── managers/
    │   └── SessionManager.js
    └── services/
        ├── ChatbotService.js
        └── MenuService.js
```

### Responsabilidades

| Componente | Responsabilidade |
|---|---|
| `index.js` | Inicialização da API e do bot |
| `WhatsAppBot.js` | Integração com o WhatsApp |
| `MessageHandler.js` | Tratamento das mensagens |
| `SessionManager.js` | Gerenciamento das sessões de atendimento |
| `ChatbotService.js` | Serviços relacionados ao chatbot |
| `MenuService.js` | Organização dos menus |
| `server.js` | Rotas e autenticação da API |
| `Database.js` | Persistência dos dados locais |
| `public/index.html` | Interface administrativa |
| `criar-admin.js` | Criação de administrador inicial |

## 🚀 Instalação e execução

### Pré-requisitos

- Node.js e npm.
- Git.
- Google Chrome compatível com a configuração do projeto.
- Acesso ao WhatsApp para autenticação do bot.

**Importante:** a configuração atual utiliza o caminho `/usr/bin/google-chrome-stable`, comum em determinadas instalações Linux. Outros ambientes podem exigir ajustes em `src/config/whatsappConfig.js`.

### 1. Clonar o repositório

```bash
git clone https://github.com/juliocmonte0205-beep/Cotrami-bot.git
cd Cotrami-bot
```

### 2. Instalar as dependências

```bash
npm install
```

### 3. Criar o administrador inicial

```bash
npm run admin
```

Siga as instruções do terminal para cadastrar o administrador.

### 4. Iniciar a aplicação

```bash
npm start
```

O sistema inicia a API administrativa e o bot do WhatsApp.

### 5. Acessar o painel

Por padrão, o painel está disponível em:

**http://127.0.0.1:3000**

A aplicação utiliza `HOST=127.0.0.1` e `PORT=3000` como valores padrão.

Na primeira execução do WhatsApp, pode ser necessário autenticar a sessão.

## 🌐 Principais endpoints

| Método | Endpoint | Acesso |
|---|---|---|
| POST | `/api/login` | Público |
| POST | `/api/logout` | Autenticado |
| GET | `/api/me` | Autenticado |
| GET | `/api/usuarios` | Administrador |
| POST | `/api/usuarios` | Administrador |
| GET/POST | `/api/linhas` | Autenticado |
| PUT/DELETE | `/api/linhas/:id` | Autenticado |
| GET/POST | `/api/veiculos` | Autenticado |
| PUT/DELETE | `/api/veiculos/:id` | Autenticado |
| GET/POST | `/api/viagens` | Autenticado |
| PUT/DELETE | `/api/viagens/:id` | Autenticado |
| GET | `/api/publico/linhas` | Público |
| GET | `/api/publico/viagens?data=AAAA-MM-DD` | Público |

As rotas autenticadas utilizam tokens Bearer.

## 💾 Persistência dos dados

O sistema utiliza o arquivo local `data/cotrami.json`, criado automaticamente quando necessário.

Os dados são organizados em quatro coleções:

- `usuarios`
- `linhas`
- `veiculos`
- `viagens`

O arquivo de dados local não é versionado no GitHub.

**Atenção:** o armazenamento atual é baseado em arquivo JSON e não foi projetado para múltiplas instâncias realizando gravações simultâneas. Cada desenvolvedor deve utilizar seu próprio ambiente de desenvolvimento.

## 🔐 Segurança

- Senhas armazenadas por meio de hash com salt e `scrypt`.
- Tokens de sessão gerados com `crypto.randomBytes`.
- Sessões administrativas com validade de 8 horas.
- Rotas protegidas por autenticação.
- Restrição de gerenciamento de usuários a administradores.

Nunca publique credenciais, arquivos `.env` reais, sessões do WhatsApp ou dados privados no repositório.

O projeto está em desenvolvimento e necessita de revisão adicional de segurança antes de ser disponibilizado publicamente na internet como serviço.

## 🤝 Como contribuir

O projeto utiliza Git e GitHub para desenvolvimento colaborativo.

### Fluxo recomendado

1. Atualize sua branch principal:

```bash
git switch main
git pull origin main
```

2. Crie uma branch para sua tarefa:

```bash
git switch -c feat/nome-da-funcionalidade
```

3. Desenvolva e teste as alterações.

4. Revise os arquivos modificados:

```bash
git status
```

5. Registre as alterações:

```bash
git add .
git commit -m "feat: descricao da funcionalidade"
```

6. Envie sua branch:

```bash
git push -u origin feat/nome-da-funcionalidade
```

7. Abra um **Pull Request** no GitHub para revisão e integração à `main`.

### Padrão de commits

- `feat:` nova funcionalidade.
- `fix:` correção de problema.
- `docs:` documentação.
- `refactor:` reorganização do código.
- `test:` testes.

## 🗺️ Roadmap

### Próximas melhorias

- [ ] Separar horários fixos das viagens e das atribuições de veículos.
- [ ] Implementar escala semanal de veículos.
- [ ] Diferenciar dias úteis e finais de semana.
- [ ] Facilitar atualizações das escalas pelo painel.
- [ ] Aprimorar a experiência de atendimento pelo WhatsApp.
- [ ] Melhorar a configuração do navegador para diferentes sistemas operacionais.
- [ ] Adicionar testes automatizados.
- [ ] Avaliar integrações de inteligência artificial para leitura e organização de informações operacionais.

## 📄 Status do projeto

**Em desenvolvimento ativo.**

O Cotrami Bot é um projeto colaborativo de software, sujeito a melhorias, testes e evolução contínua.
