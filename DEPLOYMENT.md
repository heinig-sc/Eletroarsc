# Instruções de Implantação (Deployment)

Este é um aplicativo **Full-Stack** (Node.js + React). Ele não pode ser executado apenas em um servidor HTML estático (como o `public_html` básico do cPanel sem suporte a Node.js).

## Requisitos do Servidor
- **Node.js**: Versão 18 ou superior.
- **Banco de Dados**: Um projeto no [Supabase](https://supabase.com).

## Passos para Implantação

### 1. Configurar o Banco de Dados (Supabase)
1. Crie um projeto gratuito no Supabase.
2. Vá em **SQL Editor** e execute o conteúdo do arquivo `supabase_migration.sql` que está na raiz do projeto. Isso criará todas as tabelas necessárias.

### 2. Variáveis de Ambiente
Você deve configurar as seguintes variáveis de ambiente no seu servidor (ou em um arquivo `.env` na raiz):

```env
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role
JWT_SECRET=uma-chave-secreta-segura
SESSION_SECRET=outra-chave-secreta
```

*Nota: Você encontra as chaves do Supabase em **Project Settings > API**.*

### 3. Instalação e Build
No seu servidor, execute:

```bash
npm install
npm run build
```

### 4. Iniciar o Servidor
Para iniciar o aplicativo em produção:

```bash
npm start
```

### 5. Implantação no Netlify
Este projeto já está configurado para o Netlify usando **Netlify Functions** para o backend.

1. Conecte seu repositório ao Netlify.
2. Configure as **Environment Variables** no painel do Netlify (Site Settings > Build & Deploy > Environment):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JWT_SECRET`
   - `SESSION_SECRET`
3. O Netlify usará o arquivo `netlify.toml` automaticamente para:
   - Rodar `npm run build`.
   - Publicar a pasta `dist`.
   - Configurar a função serverless em `netlify/functions/api.ts`.
4. **Importante**: Como as funções são serverless, o login via sessão (cookies) pode ser instável. O sistema prefere o uso de JWT (armazenado no localStorage) que já está implementado.

## Erro de Conexão? (Troubleshooting)

Se você vir "Erro de conexão", verifique:
1. **Ambiente**: Você está tentando abrir o arquivo `index.html` diretamente no navegador? **Isso não funciona.** Você deve acessar via `http://seu-dominio.com:3000` (ou a porta que você configurou).
2. **Backend**: O comando `npm start` está rodando sem erros no terminal do servidor?
3. **Variáveis**: O arquivo `.env` existe na raiz do projeto com as chaves do Supabase?
   - Verifique se não há espaços extras nas chaves.
   - Use `SUPABASE_SERVICE_ROLE_KEY` para evitar problemas de permissão (RLS).
4. **Teste de Saúde**: Acesse `http://seu-dominio.com:3000/health` no navegador. Ele dirá se o banco de dados está conectado ou qual é o erro exato.
5. **Porta**: Certifique-se de que a porta 3000 está aberta no firewall do seu servidor.
