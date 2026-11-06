import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'

// Две сборки из одного кода:
//   npm run build            — Playgama (platform.ts, Playgama Bridge), папка dist/
//   npm run build:gamepush   — GamePush (platform-gamepush.ts), папка dist-gamepush/
export default defineConfig(({mode}) => {
    if (mode !== 'gamepush') return {base: './'}

    // В сборке GamePush скрипт Playgama Bridge не нужен — SDK GamePush грузит platform-gamepush.ts
    const dropPlaygamaBridge: Plugin = {
        name: 'drop-playgama-bridge',
        transformIndexHtml: (html) => html.replace(/\s*<script src="https:\/\/bridge\.playgama\.com[^"]*"><\/script>/, ''),
    }

    return {
        base: './',
        resolve: {
            alias: [
                {
                    find: /^\.\/platform\.ts$/,
                    replacement: fileURLToPath(new URL('./src/platform-gamepush.ts', import.meta.url)),
                },
            ],
        },
        plugins: [dropPlaygamaBridge],
        build: {outDir: 'dist-gamepush'},
    }
})
