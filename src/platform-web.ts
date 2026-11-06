// Без площадки: своя страница или itch.io. Рекламы нет, рекорд — в памяти браузера.
// Подключается вместо platform.ts в сборке `npm run zip:web` (см. vite.config.ts).
import {isSaveData, type PlatformType, type SaveData} from './platform-types.ts'

const SAVE_KEY = 'side-gig-save'

export const platform: PlatformType = {
    init: async () => {
        platform.lang = navigator.language.slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'en'
    },
    ready: () => Promise.resolve(),
    start: () => {},
    stop: () => {},
    // Пауза при сворачивании вкладки уже есть в main.ts, площадке тут сообщать нечего
    onPause: () => {},
    onSound: (callback) => callback(true),
    adShow: () => Promise.resolve(),
    // Без рекламы нет и «жизни за рекламу»
    isRewardedSupported: () => false,
    rewardedShow: () => Promise.resolve(false),
    save: async (data: SaveData) => {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(data))
        } catch {
            // хранилище недоступно — играем без рекорда
        }
    },
    load: async () => {
        try {
            const data: unknown = JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null')
            return isSaveData(data) ? data : null
        } catch {
            return null
        }
    },
    lang: 'en',
}
