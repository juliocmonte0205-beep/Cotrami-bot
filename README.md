# Cotrami Bot — Etapa 1: Painel + API + WhatsApp

## Instalação (Linux)

1. **Faça backup da pasta do projeto atual.** Não apague `.wwebjs_auth` nem `node_modules`.
2. Copie o **conteúdo** desta pasta para a raiz do projeto atual, substituindo os arquivos correspondentes.
3. No terminal, dentro do projeto:

```bash
npm install
npm run admin
npm start
```

4. Acesse **http://127.0.0.1:3000** no mesmo computador e entre com o login e a senha criados em `npm run admin`.
5. Cadastre primeiro **Linhas**, depois **Veículos** e depois **Viagens / Escalas**.
6. No WhatsApp, digite **1** para consultar linhas cadastradas ou **2** para consultar viagens por data.

## API

- `GET /api/publico/linhas` — linhas cadastradas.
- `GET /api/publico/viagens?data=2026-11-12` — viagens previstas para a data.
- `POST /api/login` — autenticação do painel.
- `GET/POST/PUT/DELETE /api/linhas`, `/api/veiculos`, `/api/viagens` — exige token.
- `POST /api/usuarios` — exige administrador.

## Limitações IMPORTANTES desta primeira versão

- Os dados são gravados localmente em `data/cotrami.json` (backup necessário). É um **protótipo local**, não um servidor pronto para internet.
- As sessões de login são armazenadas na memória; reiniciar o servidor encerra os logins.
- A criação do primeiro administrador pede a senha no terminal **sem ocultar a digitação**; crie em ambiente privado.
- **Não exponha a porta 3000 na internet**. Antes de produção precisamos HTTPS, banco transacional, trilha de auditoria, proteção contra tentativas de login e controle mais detalhado de permissões.
- Ainda **não** há leitura automática de Excel/fotos, cálculo de chegada em paradas, GPS ou previsão por trânsito.
- Os horários no bot são **programados**, não localização real do veículo.
- A checagem de conflitos detecta apenas o mesmo carro na mesma data e horário, não sobreposições de trajetos.
- Não foram cadastrados horários nem veículos fictícios; os dados devem ser preenchidos pelos cooperados.
