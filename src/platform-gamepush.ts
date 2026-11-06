// Площадка GamePush: тот же интерфейс, что у platform.ts, но через GamePush SDK.
// Подключается вместо platform.ts в сборке `npm run zip:gamepush` (см. vite.config.ts).
// В кабинете GamePush у проекта должно быть создано поле игрока `best` (число) — иначе рекорд не сохранится.
import type {PlatformType, SaveData} from './platform-types.ts'

const PROJECT_ID = 32617
const PUBLIC_TOKEN = '4gI2gBWGWuyfz9fW2VHLhuMCSD8a4tSC'

// Адреса SDK — в том порядке, в каком их перебирает официальный загрузчик GamePush
const SDK_URLS = [
    'https://gs.eponesh.com/sdk/game-score.js',
    'https://s3.gamepush.com/files/gs/sdk/game-score.js',
    'https://s3-eu.gamepush.com/sdk/game-score.js',
    'https://gamepush.com/sdk/game-score.js',
]
const SDK_TIMEOUT = 15000

// Нам нужна лишь малая часть SDK — описываем только её
type Listener = (...args: any[]) => void
type GamePush = {
    language: string
    gameStart: VoidFunction
    gameplayStart: VoidFunction
    gameplayStop: VoidFunction
    on: (event: string, listener: Listener) => void
    ads: {
        isRewardedAvailable: boolean
        showFullscreen: () => Promise<boolean>
        showRewardedVideo: () => Promise<boolean>
    }
    sounds: {
        isMuted: boolean
        on: (event: string, listener: Listener) => void
    }
    player: {
        ready: Promise<void>
        get: (key: string) => unknown
        set: (key: string, value: unknown) => void
        sync: () => Promise<unknown>
    }
}

declare global {
    interface Window {
        onGPInit?: (gp: GamePush) => void
    }
}

let gp: GamePush | null = null

// Загружаем SDK сами: перебираем адреса, пока какой-нибудь не ответит.
// Когда SDK готов, он вызывает window.onGPInit (имя передаётся в параметре callback)
const loadSdk = () =>
    new Promise<GamePush>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('GamePush SDK не загрузился')), SDK_TIMEOUT)
        window.onGPInit = (instance) => {
            clearTimeout(timer)
            resolve(instance)
        }
        const query = `?projectId=${PROJECT_ID}&publicToken=${PUBLIC_TOKEN}&callback=onGPInit`
        const tryUrl = (index: number) => {
            if (index >= SDK_URLS.length) {
                clearTimeout(timer)
                reject(new Error('GamePush SDK недоступен'))
                return
            }
            const script = document.createElement('script')
            script.async = true
            script.src = SDK_URLS[index] + query
            script.onerror = () => {
                script.remove()
                tryUrl(index + 1)
            }
            document.head.append(script)
        }
        tryUrl(0)
    })

// gameplayStart / gameplayStop — только при смене состояния
let isGameplay = false

export const platform: PlatformType = {
    init: async () => {
        gp = await loadSdk()
        await gp.player.ready
        platform.lang = gp.language.slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'en'
    },
    ready: () => {
        gp?.gameStart()
        return Promise.resolve()
    },
    start: () => {
        if (isGameplay) return
        isGameplay = true
        gp?.gameplayStart()
    },
    stop: () => {
        if (!isGameplay) return
        isGameplay = false
        gp?.gameplayStop()
    },
    onPause: (callback) => {
        gp?.on('pause', () => callback(true))
        gp?.on('resume', () => callback(false))
    },
    onSound: (callback) => {
        if (!gp) {
            callback(true)
            return
        }
        callback(!gp.sounds.isMuted)
        gp.sounds.on('mute', () => callback(false))
        gp.sounds.on('unmute', () => callback(true))
    },
    adShow: async () => {
        // Без SDK или при сбое рекламы игра просто продолжается
        await gp?.ads.showFullscreen().catch(() => false)
    },
    isRewardedSupported: () => gp?.ads.isRewardedAvailable ?? false,
    // true — игрок досмотрел рекламу и заслужил награду
    rewardedShow: async () => {
        if (!gp) return false
        return gp.ads.showRewardedVideo().then(Boolean, () => false)
    },
    save: async (data: SaveData) => {
        if (!gp) return
        gp.player.set('best', data.best)
        await gp.player.sync()
    },
    load: async () => {
        const best = gp?.player.get('best')
        return typeof best === 'number' ? {best} : null
    },
    lang: 'en',
}
