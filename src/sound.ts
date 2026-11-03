import {platform} from './platform.ts'

// Звук синтезируется на лету: короткие писки, как у старого телефона. Файлов нет

export type SoundName =
    | 'step' | 'jump' | 'push' | 'drop' | 'land' | 'bonk' | 'helmetGone'
    | 'row' | 'crush' | 'respawn' | 'over' | 'start'

const STORAGE_KEY = 'mover-sound'

let ac: AudioContext | null = null
let master: GainNode | null = null
let noise: AudioBuffer | null = null

let isUserOn = true
try {
    isUserOn = localStorage.getItem(STORAGE_KEY) !== 'off'
} catch {
    // без localStorage — по умолчанию со звуком
}
let isPlatformOn = true
let isMutedByGame = false // реклама или пауза площадки

const isAudible = () => isUserOn && isPlatformOn && !isMutedByGame

const updateVolume = () => {
    if (master && ac) master.gain.setValueAtTime(isAudible() ? 0.35 : 0, ac.currentTime)
}

// Аудио можно включить только после жеста игрока, поэтому создаём его на первом нажатии
const ensure = () => {
    if (ac) {
        if (ac.state === 'suspended') ac.resume().catch(console.error)
        return
    }

    ac = new AudioContext()
    master = ac.createGain()
    master.connect(ac.destination)
    noise = ac.createBuffer(1, Math.floor(ac.sampleRate * 0.3), ac.sampleRate)
    const data = noise.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    updateVolume()
}

type Synth = {
    tone: (f0: number, f1: number, dur: number, type?: OscillatorType, vol?: number, delay?: number) => void
    hiss: (dur: number, vol?: number, freq?: number) => void
}

const makeSynth = (ctx: AudioContext, out: GainNode, buffer: AudioBuffer): Synth => ({
    // Один тон: частота едет от f0 к f1, громкость затухает
    tone: (f0, f1, dur, type = 'square', vol = 0.3, delay = 0) => {
        const t0 = ctx.currentTime + delay
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(f0, t0)
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur)
        gain.gain.setValueAtTime(vol, t0)
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
        osc.connect(gain).connect(out)
        osc.start(t0)
        osc.stop(t0 + dur + 0.02)
    },
    // Шум через полосовой фильтр — удары, треск, хруст
    hiss: (dur, vol = 0.3, freq = 1200) => {
        const t0 = ctx.currentTime
        const src = ctx.createBufferSource()
        const filter = ctx.createBiquadFilter()
        const gain = ctx.createGain()
        src.buffer = buffer
        filter.type = 'bandpass'
        filter.frequency.value = freq
        gain.gain.setValueAtTime(vol, t0)
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur)
        src.connect(filter).connect(gain).connect(out)
        src.start(t0)
        src.stop(t0 + dur + 0.02)
    },
})

const notes = (s: Synth, freqs: number[], dur: number, gap: number, vol: number, slide = 1) =>
    freqs.forEach((f, i) => s.tone(f, f * slide, dur, 'square', vol, i * gap))

const SFX: Record<SoundName, (s: Synth) => void> = {
    step: (s) => s.tone(1400, 1100, 0.025, 'square', 0.06),
    jump: (s) => s.tone(330, 700, 0.12, 'square', 0.15),
    push: (s) => {
        s.tone(160, 90, 0.08, 'square', 0.18)
        s.hiss(0.08, 0.15, 500)
    },
    drop: (s) => s.tone(900, 700, 0.04, 'square', 0.08),
    land: (s) => {
        s.tone(120, 50, 0.1, 'triangle', 0.4)
        s.hiss(0.05, 0.12, 300)
    },
    bonk: (s) => {
        s.hiss(0.15, 0.45, 900)
        s.tone(500, 160, 0.14, 'square', 0.2)
    },
    helmetGone: (s) => {
        s.hiss(0.2, 0.4, 1500)
        s.tone(700, 120, 0.3, 'sawtooth', 0.2)
    },
    row: (s) => notes(s, [523, 659, 784, 1047], 0.08, 0.07, 0.18),
    crush: (s) => {
        s.hiss(0.25, 0.5, 400)
        s.tone(220, 40, 0.45, 'sawtooth', 0.3)
    },
    respawn: (s) => notes(s, [392, 523, 659], 0.07, 0.07, 0.13),
    over: (s) => notes(s, [392, 330, 262, 196], 0.22, 0.22, 0.2, 0.98),
    start: (s) => notes(s, [262, 392, 523], 0.08, 0.08, 0.15),
}

// Чтобы при ливне ящиков стук не сливался в кашу
const MIN_GAP: Partial<Record<SoundName, number>> = {land: 0.06, drop: 0.08, step: 0.05}
const lastPlayed: Partial<Record<SoundName, number>> = {}

export const sound = {
    get isUserOn() {
        return isUserOn
    },
    unlock: () => ensure(),
    toggle: () => {
        isUserOn = !isUserOn
        try {
            localStorage.setItem(STORAGE_KEY, isUserOn ? 'on' : 'off')
        } catch {
            // не сохранится — не страшно
        }
        ensure()
        updateVolume()
        return isUserOn
    },
    setMutedByGame: (isMuted: boolean) => {
        isMutedByGame = isMuted
        updateVolume()
    },
    play: (name: SoundName) => {
        if (!isAudible() || !ac || !master || !noise || ac.state !== 'running') return

        const now = ac.currentTime
        const gap = MIN_GAP[name]
        if (gap !== undefined && now - (lastPlayed[name] ?? -1) < gap) return
        lastPlayed[name] = now

        SFX[name](makeSynth(ac, master, noise))
    },
}

export const soundInit = () => {
    platform.onSound((isEnabled) => {
        isPlatformOn = isEnabled
        updateVolume()
    })
}
