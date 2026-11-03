import type {} from '@playgama/bridge/global'
import type {INTERSTITIAL_STATE, REWARDED_STATE} from '@playgama/bridge/constants'

const AD_OPEN_TIMEOUT = 5000

// Такой же id нужно завести в консоли Playgama: Leaderboards → id, тип numeric, по убыванию
const LEADERBOARD_ID = 'best_score'
const TOP_SIZE = 5

export type LeaderEntry = {
    rank: number
    name: string
    score: number
    isMe: boolean
}

export type SaveData = {
    best: number
}

const isSaveData = (value: unknown): value is SaveData => {
    return typeof value === 'object' && value !== null && 'best' in value && typeof value.best === 'number'
}

export type PlatformType = {
    init: () => Promise<void>
    ready: () => Promise<void>
    start: VoidFunction
    stop: VoidFunction
    onPause: (callback: (isPaused: boolean) => void) => void
    onSound: (callback: (isEnabled: boolean) => void) => void
    adShow: () => Promise<void>
    isRewardedSupported: () => boolean
    hasLeaderboardTable: () => boolean
    hasLeaderboardPopup: () => boolean
    submitScore: (score: number) => Promise<void>
    getTop: () => Promise<LeaderEntry[]>
    showLeaderboardPopup: () => Promise<void>
    rewardedShow: () => Promise<boolean>
    save: (data: SaveData) => Promise<void>
    load: () => Promise<SaveData | null>
    lang: 'ru' | 'en'
}

// gameplay_started / gameplay_stopped отправляем только при смене состояния
let isGameplay = false

export const platform: PlatformType = {
    init: async () => {
        await bridge.initialize()

        // Площадка может отдать и 'ru', и 'ru-RU' — смотрим только на код языка
        platform.lang = bridge.platform.language.slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'en'
    },
    ready: () => {
        bridge.platform.sendMessage('game_ready')
        return Promise.resolve()
    },
    start: () => {
        if (isGameplay) return
        isGameplay = true
        bridge.platform.sendMessage('gameplay_started')
    },
    stop: () => {
        if (!isGameplay) return
        isGameplay = false
        bridge.platform.sendMessage('gameplay_stopped')
    },
    onPause: (callback) => {
        bridge.platform.on(bridge.EVENT_NAME.PAUSE_STATE_CHANGED, (isPaused) => callback(isPaused))
    },
    onSound: (callback) => {
        callback(bridge.platform.isAudioEnabled)

        bridge.platform.on(bridge.EVENT_NAME.AUDIO_STATE_CHANGED, (isEnabled) => callback(isEnabled))
    },
    adShow: () => {
        return new Promise((resolve) => {
            // Страховка: если реклама так и не открылась (блокировщик, сбой сети),
            // через AD_OPEN_TIMEOUT мс игра всё равно продолжается
            let timeoutId: ReturnType<typeof setTimeout> | null = null

            const finish = () => {
                if (timeoutId !== null) clearTimeout(timeoutId)
                bridge.advertisement.off(bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, fn)
                resolve()
            }

            const fn = (state: INTERSTITIAL_STATE) => {
                if (state === 'opened' && timeoutId !== null) {
                    // реклама реально показывается — ждём, пока игрок её закроет
                    clearTimeout(timeoutId)
                    timeoutId = null
                }

                if (state === 'failed' || state === 'closed') {
                    finish()
                }
            }

            bridge.advertisement.on(bridge.EVENT_NAME.INTERSTITIAL_STATE_CHANGED, fn)
            timeoutId = setTimeout(finish, AD_OPEN_TIMEOUT)

            bridge.advertisement.showInterstitial()
        })
    },
    isRewardedSupported: () => bridge.advertisement.isRewardedSupported,
    // true — игрок досмотрел рекламу и заслужил награду
    rewardedShow: () => {
        return new Promise((resolve) => {
            let isRewarded = false
            let timeoutId: ReturnType<typeof setTimeout> | null = null

            const finish = () => {
                if (timeoutId !== null) clearTimeout(timeoutId)
                bridge.advertisement.off(bridge.EVENT_NAME.REWARDED_STATE_CHANGED, fn)
                resolve(isRewarded)
            }

            const fn = (state: REWARDED_STATE) => {
                if (state === 'opened' && timeoutId !== null) {
                    // реклама реально показывается — ждём, пока игрок её закроет
                    clearTimeout(timeoutId)
                    timeoutId = null
                }

                if (state === 'rewarded') isRewarded = true

                if (state === 'failed' || state === 'closed') {
                    finish()
                }
            }

            bridge.advertisement.on(bridge.EVENT_NAME.REWARDED_STATE_CHANGED, fn)
            // Реклама не открылась — награды нет
            timeoutId = setTimeout(finish, AD_OPEN_TIMEOUT)

            bridge.advertisement.showRewarded()
        })
    },
    // in_game — таблицу рисует сама игра; native_popup — площадка показывает своё окно по кнопке;
    // native — площадка показывает таблицу сама; not_available — таблицы нет
    hasLeaderboardTable: () => bridge.leaderboards.type === 'in_game',
    hasLeaderboardPopup: () => bridge.leaderboards.type === 'native_popup',
    submitScore: async (score: number) => {
        if (bridge.leaderboards.type === 'not_available') return
        await bridge.leaderboards.setScore(LEADERBOARD_ID, score)
    },
    getTop: async () => {
        const entries = await bridge.leaderboards.getEntries(LEADERBOARD_ID)
        const myId = bridge.player.id
        return entries.slice(0, TOP_SIZE).map((entry) => ({
            rank: entry.rank,
            name: entry.name || '—',
            score: entry.score,
            isMe: myId !== null && entry.id === myId,
        }))
    },
    showLeaderboardPopup: async () => {
        await bridge.leaderboards.showNativePopup(LEADERBOARD_ID)
    },
    save: (data: SaveData) => {
        return bridge.storage.set('data', data)
    },
    load: () => {
        return bridge.storage.get('data').then((data) => {
            if (isSaveData(data)) {
                return data
            }

            return null
        })
    },
    lang: 'en',
}
