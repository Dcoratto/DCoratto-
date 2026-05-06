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
- `GEMINI_API_KEY` (se usar Gemini)
- `APP_URL` (URL publica da aplicacao em producao)
- `PORT` (opcional, padrao: `3000`)
- `WHATSAPP_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `RESEND_API_KEY` (opcionais)

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
