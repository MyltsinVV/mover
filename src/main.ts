import './style.css'
import {H, JUMP_BUFFER, W} from './config.ts'
import {continueWithExtraLife, endGame, getGame, input, onGameOver, onOutOfLives, resetGame, step} from './game.ts'
import {draw} from './render.ts'
import {platform} from './platform.ts'
import {sound, soundInit} from './sound.ts'
import {changeTexts, texts} from './texts.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => {
    const el = document.getElementById(id)
    if (!el) throw new Error(`Не найден элемент #${id}`)
    return el as T
}

const canvas = $<HTMLCanvasElement>('lcd')
canvas.width = W
canvas.height = H
const ctx = canvas.getContext('2d')
if (ctx === null) throw new Error('Контекст не найден')
ctx.imageSmoothingEnabled = false

const overlay = $('overlay')
const dialog = $('dialog')
const soundButton = $<HTMLButtonElement>('btn-sound')
const pauseButton = $<HTMLButtonElement>('btn-pause')

// loading → start → playing ⇄ paused → (continue → ad → playing) → over → ad → playing …
type Screen = 'loading' | 'start' | 'playing' | 'paused' | 'continue' | 'over' | 'ad'
let screen: Screen = 'loading'
let best = 0

// ---------- Табло и диалоги ----------
const renderHud = () => {
    const game = getGame()
    $('score').textContent = String(game.score)
    $('best').textContent = String(Math.max(best, game.score))
    $('lines').textContent = String(game.lines)
    $('lives').textContent = '♥'.repeat(Math.max(0, game.lives)) || '—'
}

const showDialog = (html: string, buttonId?: string, onClick?: VoidFunction) => {
    dialog.innerHTML = html
    overlay.hidden = false
    if (buttonId && onClick) {
        const button = $<HTMLButtonElement>(buttonId)
        button.addEventListener('click', onClick)
        button.focus({preventScroll: true})
    }
}

const hideDialog = () => {
    overlay.hidden = true
}

const showStart = () => {
    screen = 'start'
    showDialog(
        `<h1>${texts.name}</h1>
        <p class="sub">${texts.sub}</p>
        <p>${texts.intro1}</p>
        <p>${texts.intro2}</p>
        <button type="button" class="go" id="go">${texts.play}</button>`,
        'go',
        startGame,
    )
}

// Подписи и заголовок вкладки — на языке игрока
const applyTexts = () => {
    document.title = texts.title
    document.documentElement.lang = platform.lang
    document.querySelectorAll<HTMLElement>('[data-t]').forEach((el) => {
        const key = el.dataset.t as keyof typeof texts
        const value = texts[key]
        if (typeof value === 'string') el.textContent = value
    })
    canvas.setAttribute('aria-label', texts.screen)
    $('pad').setAttribute('aria-label', texts.pad)
    $('btn-left').setAttribute('aria-label', texts.left)
    $('btn-right').setAttribute('aria-label', texts.right)
    $('btn-jump').setAttribute('aria-label', texts.jump)
    soundButton.setAttribute('aria-label', texts.sound)
    pauseButton.setAttribute('aria-label', texts.pauseButton)
}

const updateSoundButton = () => {
    soundButton.setAttribute('aria-pressed', String(sound.isUserOn))
}

// ---------- Ход игры ----------
const startGame = () => {
    sound.unlock()
    resetGame()
    screen = 'playing'
    hideDialog()
    renderHud()
    sound.play('start')
    platform.start()
}

const pause = () => {
    if (screen !== 'playing') return
    screen = 'paused'
    input.left = input.right = false
    platform.stop()
    showDialog(
        `<h1>${texts.paused}</h1>
        <button type="button" class="go" id="resume">${texts.resume}</button>
        <button type="button" class="go alt" id="restart">${texts.restart}</button>
        <button type="button" class="go alt" id="to-menu">${texts.toMenu}</button>`,
        'resume',
        resume,
    )
    $('restart').addEventListener('click', () => {
        if (screen !== 'paused') return
        keepRecord()
        startGame()
    })
    $('to-menu').addEventListener('click', () => {
        if (screen !== 'paused') return
        keepRecord()
        resetGame()
        renderHud()
        showStart()
    })
}

// Бросил смену на середине — рекорд всё равно засчитываем
const keepRecord = () => {
    const score = getGame().score
    if (score <= best) return
    best = score
    platform.save({best}).catch(console.error)
}

const resume = () => {
    if (screen !== 'paused') return
    sound.unlock()
    screen = 'playing'
    hideDialog()
    platform.start()
}

// Перед новой партией — реклама; звук на это время глушим
const playAgain = async () => {
    if (screen !== 'over') return
    screen = 'ad'
    showDialog(`<p class="big">${texts.ad}</p>`)
    sound.setMutedByGame(true)
    await platform.adShow()
    sound.setMutedByGame(false)
    startGame()
}

// Жизни кончились — предлагаем ещё одну за рекламу (если площадка такую рекламу умеет)
onOutOfLives(() => {
    if (!platform.isRewardedSupported()) return false
    screen = 'continue'
    input.left = input.right = false
    platform.stop()
    showDialog(
        `<h1>${texts.moreLife}</h1>
        <p>${texts.moreLifeText}</p>
        <button type="button" class="go" id="watch">${texts.watchAd}</button>
        <button type="button" class="go alt" id="decline">${texts.noThanks}</button>`,
        'watch',
        () => void watchForLife(),
    )
    $('decline').addEventListener('click', () => {
        if (screen !== 'continue') return
        hideDialog()
        endGame()
    })
    return true
})

const watchForLife = async () => {
    if (screen !== 'continue') return
    screen = 'ad'
    showDialog(`<p class="big">${texts.ad}</p>`)
    sound.setMutedByGame(true)
    const isRewarded = await platform.rewardedShow()
    sound.setMutedByGame(false)

    if (!isRewarded) {
        // Нет досмотренной рекламы — нет жизни
        hideDialog()
        endGame()
        return
    }

    sound.unlock()
    continueWithExtraLife()
    screen = 'playing'
    hideDialog()
    renderHud()
    platform.start()
}

onGameOver((reason) => {
    screen = 'over'
    platform.stop()
    const game = getGame()
    const isRecord = game.score > best
    if (isRecord) {
        best = game.score
        platform.save({best}).catch(console.error)
    }
    renderHud()

    // Небольшая пауза, чтобы было видно, чем кончилось
    setTimeout(() => {
        showDialog(
            `<h1>${reason.toUpperCase()}</h1>
            <p class="big">${texts.points(game.score)}</p>
            <p>${isRecord ? texts.record : texts.bestIs(best)} · ${texts.rowsIs(game.lines)}</p>
            <button type="button" class="go" id="again">${texts.again}</button>`,
            'again',
            () => void playAgain(),
        )
    }, 700)
})

// ---------- Управление ----------
type Key = 'left' | 'right' | 'jump'

const press = (key: Key) => {
    if (key === 'jump') input.jumpBuffer = JUMP_BUFFER
    else input[key] = true
}

const release = (key: Key) => {
    if (key !== 'jump') input[key] = false
}

// Экранные кнопки держатся, пока палец на них
const bindHold = (id: string, key: Key) => {
    const el = $(id)
    const off = () => {
        release(key)
        el.classList.remove('on')
    }
    el.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        sound.unlock()
        el.setPointerCapture?.(event.pointerId)
        if (screen === 'playing') press(key)
        el.classList.add('on')
    })
    el.addEventListener('pointerup', off)
    el.addEventListener('pointercancel', off)
    el.addEventListener('lostpointercapture', off)
}

bindHold('btn-left', 'left')
bindHold('btn-right', 'right')
bindHold('btn-jump', 'jump')

pauseButton.addEventListener('click', () => {
    sound.unlock()
    if (screen === 'playing') pause()
    else if (screen === 'paused') resume()
})

soundButton.addEventListener('click', () => {
    sound.toggle()
    updateSoundButton()
})

const KEYS: Record<string, Key> = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump',
}

window.addEventListener('keydown', (event) => {
    sound.unlock()
    if (event.code === 'KeyM') {
        sound.toggle()
        updateSoundButton()
        return
    }
    if (event.code === 'KeyP' || event.code === 'Escape') {
        if (screen === 'playing') pause()
        else if (screen === 'paused') resume()
        return
    }
    if (screen !== 'playing') return
    const key = KEYS[event.code]
    if (!key) return
    event.preventDefault()
    if (key === 'jump' && event.repeat) return
    press(key)
})

window.addEventListener('keyup', (event) => {
    const key = KEYS[event.code]
    if (key) release(key)
})

// Ушёл со вкладки — пауза, а кнопки отпускаются
window.addEventListener('blur', pause)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause()
})

document.addEventListener('contextmenu', (event) => event.preventDefault())

// ---------- Цикл ----------
const SIM_STEP = 1 / 120
let lastTime: number | null = null

const frame = (now: number) => {
    const dt = lastTime === null ? 0 : Math.min(0.05, (now - lastTime) / 1000)
    lastTime = now
    if (screen === 'playing') {
        // Мелкий фиксированный шаг — чтобы столкновения не зависели от частоты кадров
        const steps = Math.ceil(dt / SIM_STEP)
        for (let i = 0; i < steps && screen === 'playing'; i++) step(dt / steps)
        renderHud()
    }
    draw(ctx, getGame())
    requestAnimationFrame(frame)
}

// ---------- Запуск ----------
Promise.allSettled([
    new FontFace('Press Start 2P', 'url(fonts/PressStart2P-Regular.ttf)').load(),
    platform.init(),
]).then(async ([fontResult, platformResult]) => {
    if (fontResult.status === 'fulfilled') document.fonts.add(fontResult.value)
    if (platformResult.status === 'rejected') console.error(platformResult.reason)

    changeTexts(platform.lang)
    applyTexts()
    updateSoundButton()
    soundInit()

    platform.onPause((isPaused) => {
        sound.setMutedByGame(isPaused)
        if (isPaused) pause()
    })

    const save = await platform.load().catch(() => null)
    best = save?.best ?? 0

    renderHud()
    showStart()
    requestAnimationFrame(frame)

    platform.ready().catch(console.error)
}).catch(console.error)

// Отладка в режиме разработки: window.__mover в консоли
if (import.meta.env.DEV) {
    Object.assign(window, {__mover: {getGame, step, input, startGame}})
}
