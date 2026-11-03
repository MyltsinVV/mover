import type {} from '@playgama/bridge/global'
import type {INTERSTITIAL_STATE, REWARDED_STATE} from '@playgama/bridge/constants'

const AD_OPEN_TIMEOUT = 5000

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

        platform.lang = bridge.platform.language === 'ru' ? 'ru' : 'en'
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
