# Interior AI

Visualiza cualquier mueble en tu habitación usando IA — Stable Diffusion Inpainting + Claude.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Next.js API Routes |
| Renders | Replicate — SDXL Inpainting |
| Prompt | Anthropic Claude Haiku |
| Máscara | Auto-generada con sharp (centro-inferior) |

---

## Requisitos

- Node.js ≥ 18
- Cuenta en [Replicate](https://replicate.com) (pago por uso, ~$0.01–0.05 por render)
- Cuenta en [Anthropic](https://console.anthropic.com) (pago por uso, centavos por 1k tokens)

---

## Setup en 3 pasos

### 1. Instala dependencias

```bash
cd interior-ai
npm install
```

### 2. Configura las API keys

Copia `.env.example` a `.env.local` y rellena tus claves:

```bash
cp .env.example .env.local
```

```env
REPLICATE_API_TOKEN=r8_xxxx   # https://replicate.com/account/api-tokens
ANTHROPIC_API_KEY=sk-ant-xxxx # https://console.anthropic.com/settings/api-keys
```

### 3. Corre el servidor de desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000).

---

## Cómo funciona

```
Usuario sube foto habitación
         │
         ▼
  Auto-genera máscara (SVG → PNG)
  zona centro-inferior de la imagen
         │
         ▼
  Claude Haiku convierte descripción del usuario
  en prompt optimizado para Stable Diffusion
         │
         ▼
  Replicate SDXL Inpainting:
  - image   = foto habitación
  - mask    = zona blanca = donde irá el mueble
  - prompt  = descripción optimizada
         │
         ▼
  Devuelve URL de imagen renderizada
```

---

## Personalizar la zona de la máscara

Por defecto la máscara cubre el 50 % central de la imagen en el 40 % inferior
(zona típica del suelo). Para cambiarlo, edita `lib/mask.ts`:

```ts
// Cambia estos valores (0–1, normalizado)
const r = region ?? { x: 0.25, y: 0.55, w: 0.5, h: 0.4 };
//                         ^izq   ^arriba  ^ancho  ^alto
```

En una futura iteración puedes reemplazar esto con un canvas interactivo en el
frontend donde el usuario pinte la zona.

---

## Deploy

El proyecto es un app Next.js estándar. Puedes desplegarlo en:
- **Vercel** (recomendado): `vercel --prod`
- **Railway / Render / Fly.io**: cualquier plataforma que soporte Node.js

Asegúrate de añadir `REPLICATE_API_TOKEN` y `ANTHROPIC_API_KEY` como variables
de entorno en la plataforma de tu elección.

---

## Estructura del proyecto

```
interior-ai/
├── app/
│   ├── layout.tsx              # Layout raíz
│   ├── page.tsx                # UI principal
│   ├── globals.css
│   └── api/
│       ├── generate/route.ts   # Pipeline principal de render
│       └── enhance-prompt/route.ts  # Optimizador de prompt con Claude
├── lib/
│   └── mask.ts                 # Generador automático de máscara
├── .env.example
├── package.json
└── README.md
```
