import {fileURLToPath} from 'node:url'
import {defineConfig, type Plugin} from 'vite'

// Три сборки из одного кода:
//   npm run build            — Playgama (platform.ts, Playgama Bridge), папка dist/
//   npm run build:gamepush   — GamePush (platform-gamepush.ts), папка dist-gamepush/
//   npm run build:web        — без площадки, для itch.io и своего сайта (platform-web.ts), папка dist-web/
const PLATFORM_FILES: Record<string, string> = {
    gamepush: './src/platform-gamepush.ts',
    web: './src/platform-web.ts',
}

export default defineConfig(({mode}) => {
    const platformFile = PLATFORM_FILES[mode]
    if (!platformFile) return {base: './'}

    // Скрипт Playgama Bridge нужен только сборке для Playgama
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
                    replacement: fileURLToPath(new URL(platformFile, import.meta.url)),
                },
            ],
        },
        plugins: [dropPlaygamaBridge],
        build: {outDir: `dist-${mode}`},
    }
})
