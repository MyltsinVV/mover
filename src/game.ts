import {
    BOX_FALL, BREAK_PART, CELL, CLEAR_TIME, COLS, FALL_T, HELMET_HITS, JUMP_H, JUMP_T,
    LIVES, MOVE_T, ROWS, STEP_PART, TOP, W,
} from './config.ts'
import {BODY, HEAD, headWithHelmet, LEGS, MAN_FLAT, randomLook} from './sprites.ts'
import {sound} from './sound.ts'
import {texts} from './texts.ts'

// ---------- Типы ----------
export type Box = { look: number, slide: number, slideFrom: number }
export type FallingBox = { col: number, y: number, look: number, dropped?: boolean }
export type Crane = { x: number, dir: 1 | -1, target: number, look: number, carrying: boolean, speed: number }
export type Fx =
    | { kind: 'bit', x: number, y: number, vx: number, vy: number, t: number }
    | { kind: 'text', x: number, y: number, text: string, t: number }
    | { kind: 'flash', t: number }

type PlayerMode = 'idle' | 'move' | 'jump' | 'fall'

export type Player = {
    col: number
    row: number
    fromCol: number // откуда идёт анимация шага или падения
    fromY: number
    mode: PlayerMode
    t: number // время в текущем шаге
    jt: number // время в прыжке
    idleT: number // сколько стоит на месте — для поворотов головы
    facing: 1 | -1
    dead: number // сколько ещё лежит раздавленным
    invul: number // неуязвимость после воскрешения
    walkFrame: number
    helmet: number // сколько ударов головой ещё выдержит каска
}

export type Game = {
    grid: (Box | null)[][]
    falling: FallingBox[]
    cranes: Crane[]
    fx: Fx[]
    clearing: { rows: number[], t: number } | null
    player: Player
    score: number
    lines: number
    level: number
    lives: number
    isContinueUsed: boolean // лишнюю жизнь за рекламу дают один раз за игру
    over: boolean
    craneTimer: number
}

// Прыжок запоминается на мгновение, чтобы нажатие во время шага не потерялось
export const input = {left: false, right: false, jumpBuffer: 0}

let gameOverHandler: (reason: string) => void = () => {}
export const onGameOver = (handler: (reason: string) => void) => {
    gameOverHandler = handler
}

// Жизни кончились: обработчик возвращает true, если предложил игроку продолжить за рекламу
let outOfLivesHandler: () => boolean = () => false
export const onOutOfLives = (handler: () => boolean) => {
    outOfLivesHandler = handler
}

// ---------- Новая игра ----------
const newBox = (): Box => ({look: randomLook(), slide: 0, slideFrom: 0})

const shuffle = <T>(list: T[]) => {
    for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
    }
    return list
}

const newGame = (): Game => {
    const grid = Array.from({length: ROWS + 2}, () => Array<Box | null>(COLS).fill(null))
    // На складе уже лежит немного ящиков: неполный нижний ряд и пара сверху
    const startCol = 4
    const free = shuffle([...Array(COLS).keys()].filter((c) => c !== startCol))
    const bottom = free.slice(0, 4 + Math.floor(Math.random() * 3))
    for (const c of bottom) grid[0][c] = newBox()
    const second = shuffle(bottom.slice()).slice(0, 1 + Math.floor(Math.random() * 2))
    for (const c of second) grid[1][c] = newBox()

    return {
        grid,
        falling: [],
        cranes: [],
        fx: [],
        clearing: null,
        player: {
            col: startCol, row: 0, fromCol: startCol, fromY: 0, mode: 'idle', t: 0, jt: 0, idleT: 0,
            facing: 1, dead: 0, invul: 1.5, walkFrame: 0, helmet: HELMET_HITS,
        },
        score: 0,
        lines: 0,
        level: 1,
        lives: LIVES,
        isContinueUsed: false,
        over: false,
        craneTimer: 0.8,
    }
}

let state: Game = newGame()

export const getGame = () => state

export const resetGame = () => {
    state = newGame()
    input.left = input.right = false
    input.jumpBuffer = 0
}

// ---------- Сетка ----------
const inBounds = (c: number, r: number) => c >= 0 && c < COLS && r >= 0
const cell = (c: number, r: number) =>
    c >= 0 && c < COLS && r >= 0 && r < state.grid.length ? state.grid[r][c] : null

// Падающий ящик, который задевает клетку
const fallingAt = (c: number, r: number) =>
    state.falling.find((b) => b.col === c && b.y < r + 1 - 0.001 && b.y + 1 > r + 0.001) ?? null

const occupied = (c: number, r: number) => !inBounds(c, r) || !!cell(c, r) || !!fallingAt(c, r)

const columnHeight = (c: number) => {
    let h = 0
    for (let r = 0; r < state.grid.length; r++) if (state.grid[r][c]) h = r + 1
    return h
}

// ---------- Краны ----------
const pickColumn = () => {
    const options: number[] = []
    for (let c = 0; c < COLS; c++) {
        if (columnHeight(c) >= ROWS) continue
        // С ростом уровня кран чаще бросает рядом с грузчиком
        const weight = Math.abs(c - state.player.col) <= 1 ? state.level : 1
        for (let i = 0; i < weight; i++) options.push(c)
    }
    if (options.length === 0) return Math.floor(Math.random() * COLS)
    return options[Math.floor(Math.random() * options.length)]
}

const spawnCrane = () => {
    const fromLeft = Math.random() < 0.5
    state.cranes.push({
        x: fromLeft ? -1 : COLS,
        dir: fromLeft ? 1 : -1,
        target: pickColumn(),
        look: randomLook(),
        carrying: true,
        speed: 4.5 + state.level * 0.5,
    })
}

const updateCranes = (dt: number) => {
    const maxCranes = state.level >= 5 ? 3 : 2
    state.craneTimer -= dt
    if (state.craneTimer <= 0 && state.cranes.length < maxCranes) {
        spawnCrane()
        state.craneTimer = Math.max(0.5, 1.7 - state.level * 0.12)
    }
    // Кран едет через весь склад, не останавливаясь, и отпускает ящик на ходу над нужной колонкой
    for (const crane of state.cranes) {
        const before = crane.x
        crane.x += crane.speed * dt * crane.dir
        if (crane.carrying && (before - crane.target) * (crane.x - crane.target) <= 0) {
            state.falling.push({col: crane.target, y: ROWS, look: crane.look})
            crane.carrying = false
            sound.play('drop')
        }
    }
    state.cranes = state.cranes.filter((crane) => crane.x > -2 && crane.x < COLS + 1)
}

// ---------- Ящики ----------
const finishGame = (reason: string) => {
    if (state.over) return
    state.over = true
    sound.play('over')
    gameOverHandler(reason)
}

const settle = (b: FallingBox) => {
    const r = Math.round(b.y)
    if (r >= ROWS) {
        finishGame(texts.full)
        return
    }
    state.grid[r][b.col] = {look: b.look, slide: 0, slideFrom: 0}
    sound.play('land')
    state.score += 1
    checkLines()
}

const updateFalling = (dt: number) => {
    const landed: FallingBox[] = []
    state.falling.sort((a, b) => a.y - b.y)
    for (const b of state.falling) {
        let ny = b.y - BOX_FALL * dt
        let floorY = 0
        for (let r = Math.min(Math.floor(b.y), state.grid.length - 1); r >= 0; r--) {
            if (state.grid[r][b.col]) {
                floorY = r + 1
                break
            }
        }
        if (ny <= floorY) {
            ny = floorY
            landed.push(b)
        } else {
            // Падающий не проваливается сквозь другой падающий ящик в той же колонке
            for (const other of state.falling) {
                if (other !== b && other.col === b.col && other.y < b.y && ny < other.y + 1) ny = other.y + 1
            }
        }
        b.y = ny
    }
    for (const b of landed) {
        state.falling = state.falling.filter((x) => x !== b)
        settle(b)
        if (state.over) return
    }
}

// Лежащий ящик без опоры начинает падать (например, после толчка с края)
const applyGravity = () => {
    for (let r = 1; r < state.grid.length; r++) {
        for (let c = 0; c < COLS; c++) {
            const box = state.grid[r][c]
            if (box && !state.grid[r - 1][c] && box.slide <= 0) {
                state.grid[r][c] = null
                // сорвался с уступа — его уже не толкнуть
                state.falling.push({col: c, y: r, look: box.look, dropped: true})
            }
        }
    }
}

const checkLines = () => {
    if (state.clearing) return
    const full: number[] = []
    for (let r = 0; r < ROWS; r++) if (state.grid[r].every(Boolean)) full.push(r)
    if (full.length) state.clearing = {rows: full, t: CLEAR_TIME}
}

const finishClear = (rows: number[]) => {
    const p = state.player
    for (const r of rows.sort((a, b) => b - a)) {
        state.grid.splice(r, 1)
        state.grid.push(Array<Box | null>(COLS).fill(null))
        // Всё, что выше убранного ряда, опускается — и грузчик тоже
        if (p.row > r) {
            p.row--
            p.fromY = Math.max(0, p.fromY - 1)
        }
        for (const b of state.falling) if (b.y >= r + 1) b.y -= 1
    }
    const n = rows.length
    const gain = 100 * n * n * state.level
    state.score += gain
    state.lines += n
    state.level = 1 + Math.floor(state.lines / 4)
    popText(W / 2, TOP + 40, n > 1 ? texts.multiRow(n, gain) : texts.row(gain))
    sound.play('row')
    state.clearing = null
    checkLines()
}

// ---------- Грузчик ----------
// Толкнуть то, что стоит в клетке (c, r), в сторону dir
const tryPush = (c: number, r: number, dir: number) => {
    const to = c + dir
    const box = cell(c, r)
    if (box) {
        if (box.slide > 0) return false
        if (r > 0 && !cell(c, r - 1)) return false // ящик висит над пустотой — сейчас упадёт
        if (cell(c, r + 1) || fallingAt(c, r + 1)) return false // сверху лежит ящик — не сдвинуть
        if (occupied(to, r)) return false
        state.grid[r][to] = {...box, slide: MOVE_T, slideFrom: -dir}
        state.grid[r][c] = null
        sound.play('push')
        return true
    }
    const falling = fallingAt(c, r)
    if (falling && !falling.dropped) {
        // Ящик, летящий с крана, тоже можно отпихнуть в сторону
        const r0 = Math.floor(falling.y)
        const r1 = Math.ceil(falling.y) - (Number.isInteger(falling.y) ? 1 : 0)
        for (let rr = r0; rr <= Math.max(r0, r1); rr++) if (occupied(to, rr)) return false
        falling.col = to
        sound.play('push')
        return true
    }
    return false
}

const supported = (p: Player) => p.row === 0 || !!cell(p.col, p.row - 1)
const jumpHeight = (p: Player) =>
    p.mode === 'jump' ? JUMP_H * Math.sin(Math.PI * Math.min(1, p.jt / JUMP_T)) : 0
const highEnough = (p: Player) => p.mode === 'jump' && jumpHeight(p) >= JUMP_H * STEP_PART
const rising = (p: Player) => p.mode === 'jump' && p.jt <= JUMP_T * BREAK_PART

// Шаг в соседнюю клетку на уровне row — с толчком ящика, если он там
const canStep = (to: number, row: number, dir: number) => {
    if (to < 0 || to >= COLS) return false
    if (cell(to, row + 1) || fallingAt(to, row + 1)) return false // голова не пролезет
    if (occupied(to, row) && !tryPush(to, row, dir)) return false
    return true
}

const startMove = (p: Player, dir: number, row: number) => {
    const to = p.col + dir
    if (!canStep(to, row, dir)) return false
    p.fromCol = p.col
    p.fromY = p.row + jumpHeight(p)
    p.col = to
    p.row = row
    p.mode = 'move'
    p.t = 0
    p.walkFrame ^= 1
    sound.play('step')
    return true
}

const startFall = (p: Player) => {
    p.fromCol = p.col
    p.fromY = p.row
    p.row -= 1
    p.mode = 'fall'
    p.t = 0
}

const updatePlayer = (dt: number) => {
    const p = state.player
    p.invul = Math.max(0, p.invul - dt)
    p.t += dt
    input.jumpBuffer = Math.max(0, input.jumpBuffer - dt)

    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0)
    if (dir !== 0) p.facing = dir > 0 ? 1 : -1

    switch (p.mode) {
        case 'idle':
            p.idleT += dt
            if (!supported(p)) {
                startFall(p)
                break
            }
            // Прыгать мешает только лежащий ящик над головой; в падающий можно ударить головой
            if (input.jumpBuffer > 0 && p.row + 2 < ROWS && !cell(p.col, p.row + 2)) {
                input.jumpBuffer = 0
                p.mode = 'jump'
                p.jt = 0
                sound.play('jump')
            } else if (dir !== 0) {
                p.idleT = 0
                startMove(p, dir, p.row)
            }
            break
        case 'move':
            if (p.t >= MOVE_T) {
                p.fromCol = p.col
                p.fromY = p.row
                if (!supported(p)) startFall(p)
                else {
                    p.mode = 'idle'
                    if (dir !== 0 && input.jumpBuffer <= 0) startMove(p, dir, p.row)
                }
            }
            break
        case 'jump':
            p.jt += dt
            // В верхней части прыжка можно шагнуть на ящик или толкнуть верхний ящик стопки
            if (dir !== 0 && highEnough(p) && startMove(p, dir, p.row + 1)) break
            if (p.jt >= JUMP_T) {
                p.mode = 'idle'
                p.idleT = 0
                p.fromCol = p.col
                p.fromY = p.row
            }
            break
        case 'fall':
            if (p.t >= FALL_T) {
                p.fromCol = p.col
                p.fromY = p.row
                if (supported(p)) p.mode = 'idle'
                else startFall(p)
            }
            break
    }
}

// Падающий ящик против грузчика: на взлёте и в каске — разбит головой, иначе раздавило
const checkHits = () => {
    const p = state.player
    const pos = playerPos(p)
    const headTop = pos.y + 2
    for (const b of [...state.falling]) {
        if (b.col !== p.col) continue
        if (b.y > headTop || b.y + 1 <= pos.y + 1) continue
        if (p.invul > 0) {
            // После воскрешения ящики просто разлетаются — без очков и без вреда каске
            state.falling = state.falling.filter((x) => x !== b)
            debris(b.col, b.y, 12)
            sound.play('bonk')
        } else if (rising(p) && p.helmet > 0) {
            state.falling = state.falling.filter((x) => x !== b)
            p.helmet--
            state.score += 10
            debris(b.col, b.y, 12)
            popText((b.col + 0.5) * CELL, yToScreen(b.y + 1), p.helmet > 0 ? texts.bonk : texts.helmetGone)
            sound.play(p.helmet > 0 ? 'bonk' : 'helmetGone')
        } else {
            crush()
            return
        }
    }
}

const crush = () => {
    state.player.dead = 1.4
    state.lives--
    state.fx.push({kind: 'flash', t: 0.25})
    sound.play('crush')
}

// Воскресает над самой низкой колонкой, с новой каской
const respawn = () => {
    let bestCol = 0
    let bestHeight = Infinity
    for (let c = 0; c < COLS; c++) {
        const h = columnHeight(c)
        if (h < bestHeight) {
            bestHeight = h
            bestCol = c
        }
    }
    Object.assign(state.player, {
        col: bestCol, row: bestHeight, fromCol: bestCol, fromY: bestHeight, mode: 'idle',
        t: 0, jt: 0, idleT: 0, dead: 0, invul: 2, helmet: HELMET_HITS,
    })
    sound.play('respawn')
}

// Досмотрел рекламу — ещё одна жизнь
export const continueWithExtraLife = () => {
    state.isContinueUsed = true
    state.lives = 1
    respawn()
}

// Отказался от продолжения или реклама не показалась
export const endGame = () => finishGame(texts.crushed)

// Позиция для отрисовки — плавно между клетками и по дуге в прыжке
export const playerPos = (p: Player) => {
    if (p.mode === 'jump') return {x: p.col, y: p.row + jumpHeight(p)}
    let k = 1
    if (p.mode === 'move') k = Math.min(1, p.t / MOVE_T)
    else if (p.mode === 'fall') k = Math.min(1, p.t / FALL_T)
    return {x: p.fromCol + (p.col - p.fromCol) * k, y: p.fromY + (p.row - p.fromY) * k}
}

// Кадр грузчика: стоя он вертит головой, на ходу смотрит, куда идёт
export const manFrame = (p: Player) => {
    if (p.dead > 0) return MAN_FLAT
    let head = HEAD.center
    if (p.mode === 'idle') head = [HEAD.center, HEAD.left, HEAD.center, HEAD.right][Math.floor(p.idleT / 0.7) % 4]
    else if (p.mode === 'move') head = p.facing < 0 ? HEAD.left : HEAD.right
    let legs = LEGS.stand
    if (p.mode === 'jump' || p.mode === 'fall') legs = LEGS.jump
    else if (p.mode === 'move' && p.walkFrame) legs = LEGS.walk
    return [...headWithHelmet(head, p.helmet), ...BODY, ...legs]
}

// ---------- Эффекты ----------
export const yToScreen = (cellY: number) => TOP + (ROWS - cellY) * CELL

const debris = (c: number, r: number, count: number) => {
    for (let i = 0; i < count; i++) {
        state.fx.push({
            kind: 'bit',
            x: (c + 0.5) * CELL,
            y: yToScreen(r + 0.5),
            vx: (Math.random() - 0.5) * 220,
            vy: -80 - Math.random() * 160,
            t: 0.5 + Math.random() * 0.3,
        })
    }
}

const popText = (x: number, y: number, text: string) => {
    state.fx.push({kind: 'text', x, y, text, t: 1})
}

// ---------- Шаг симуляции ----------
export const step = (dt: number) => {
    if (state.over) return

    if (state.clearing) {
        state.clearing.t -= dt
        if (state.clearing.t <= 0) finishClear(state.clearing.rows)
    }

    updateCranes(dt)
    updateFalling(dt)
    if (state.over) return

    for (const row of state.grid) {
        for (const box of row) if (box && box.slide > 0) box.slide = Math.max(0, box.slide - dt)
    }
    applyGravity()

    const p = state.player
    if (p.dead > 0) {
        p.dead -= dt
        if (p.dead <= 0) {
            if (state.lives <= 0) {
                if (!state.isContinueUsed && outOfLivesHandler()) {
                    p.dead = 1 // лежит раздавленный, пока игрок решает
                    return
                }
                finishGame(texts.crushed)
                return
            }
            respawn()
        }
    } else {
        updatePlayer(dt)
        checkHits()
        // Ящик лёг прямо в клетку грузчика — раздавило (или вытолкнуло наверх, если неуязвим)
        if (p.dead <= 0 && (cell(p.col, p.row) || cell(p.col, p.row + 1))) {
            if (p.invul > 0) {
                p.row = columnHeight(p.col)
                p.fromY = p.row
                p.fromCol = p.col
                p.mode = 'idle'
            } else crush()
        }
    }

    for (const f of state.fx) {
        f.t -= dt
        if (f.kind === 'bit') {
            f.x += f.vx * dt
            f.y += f.vy * dt
            f.vy += 600 * dt
        }
        if (f.kind === 'text') f.y -= 30 * dt
    }
    state.fx = state.fx.filter((f) => f.t > 0)
}
