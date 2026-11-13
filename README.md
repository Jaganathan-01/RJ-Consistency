# RJ Consistency — Personal Discipline, Habit Tracking & Accountability PWA

RJ Consistency is an offline-first Progressive Web Application designed for Android smartphones and desktop browsers. All data is stored locally in IndexedDB via Dexie.js with zero external backends, subscriptions, or API keys.

## Project Structure

```
├── public/
│   ├── _redirects               # Cloudflare Pages SPA fallback
│   ├── icon.svg                 # Vector app icon
│   ├── apple-touch-icon.png     # 180x180 iOS icon
│   ├── pwa-192x192.png          # 192x192 Android icon
│   ├── pwa-512x512.png          # 512x512 Android icon
│   └── pwa-maskable-512x512.png # Maskable icon with safe-zone padding
├── src/
│   ├── components/              # AppShell, CommitmentFormModal, PWAInstallButton, shadcn/ui primitives
│   ├── hooks/                   # usePWAInstall, useOnlineStatus
│   ├── services/                # Pure business logic & Dexie persistence
│   │   ├── databaseService.ts
│   │   ├── commitmentService.ts
│   │   ├── timerService.ts
│   │   ├── streakEngine.ts
│   │   ├── freezeEngine.ts
│   │   ├── recoveryEngine.ts
│   │   ├── analyticsService.ts
│   │   ├── notificationService.ts
│   │   └── backupService.ts
│   ├── store/useAppStore.ts     # Zustand reactive store
│   ├── types/models.ts          # TypeScript domain interfaces
│   ├── utils/dateUtils.ts       # Timezone & DST-safe logical date arithmetic
│   ├── views/                   # Dashboard, Commitments, Focus, Streaks, Recovery, Analytics, History, Settings
│   ├── test/                    # Vitest unit tests with fake-indexeddb
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── vite.config.ts               # Vite + Tailwind v4 + VitePWA + Workbox
└── vitest.config.ts             # Vitest configuration
```

## Local Setup, Build & Testing

```bash
# Install dependencies
npm install

# Run development server (port 3000)
npm run dev

# Typecheck
npm run lint

# Run unit tests
npm test

# Build production bundle
npm run build
```

## GitHub & Cloudflare Pages Deployment (Free Plan)

1. Push your repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial RJ Consistency PWA release"
   git branch -M main
   git remote add origin https://github.com/<username>/consistency-pwa.git
   git push -u origin main
   ```
2. Log in to **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Select your GitHub repository and configure:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
4. Deploy. Cloudflare Pages serves the app over a public **HTTPS** URL (`https://<project>.pages.dev`) with `public/_redirects` handling SPA fallback routing.

## Android PWA Installation Instructions

1. Open your deployed HTTPS URL in **Chrome for Android**.
2. Tap **Install App** in the app's sidebar/menu (or open Chrome's three-dot menu → **Install app** / **Add to Home screen**).
3. Launch **RJ Consistency** from your Android home screen. It runs in `standalone` display mode and continues functioning offline using Workbox cached assets and IndexedDB storage.
