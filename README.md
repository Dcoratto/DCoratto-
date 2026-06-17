<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Deploy Guide

Projeto React (Vite) + servidor Express no `server.ts`.

## Requisitos

- Node.js 20+
- NPM 10+

## Variaveis de ambiente

Copie `.env.example` para `.env` e preencha:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (necessaria para criar/confirmar/resetar o admin automaticamente pelo servidor)
- `GEMINI_API_KEY` (se usar Gemini)
- `APP_URL` (URL publica da aplicacao em producao)
- `PORT` (opcional, padrao: `3000`)
- `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `RESEND_API_KEY` (opcionais)

## Banco de dados

Rode o conteudo de `supabase_schema.sql` no SQL Editor do Supabase. Esse script e idempotente e nao apaga dados existentes.

O login administrativo padrao e:

- E-mail: `dcorattoinovacao@gmail.com`
- Senha: `sob_medida`

## Rodar local

1. `npm install`
2. `npm run dev`

## Build de producao

1. `npm run lint`
2. `npm run build`

## Subir em producao

- Linux/macOS: `npm run start`
- Windows: `npm run start:win`

O servidor expoe a SPA compilada em `dist/` e a API no mesmo processo.
