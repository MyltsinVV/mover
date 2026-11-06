// Что игра ждёт от площадки. Каждая площадка — свой файл с этим интерфейсом:
// platform.ts (Playgama) и platform-gamepush.ts (GamePush). Сама игра про площадки не знает.

export type SaveData = {
    best: number
}

export const isSaveData = (value: unknown): value is SaveData => {
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
