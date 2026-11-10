import {heroPose} from './anim.ts'
import {CELL, CLEAR_TIME, COLORS, COLS, FLOOR, FONT, H, MOVE_T, W} from './config.ts'
import {CRATE_CHIPS, CRATES} from './crates.ts'
import {type Game, type Player, playerPos, yToScreen} from './game.ts'
import {drawHero, type Shape} from './hero.ts'

// Всё рисуется в «клеточных» единицах (клетка — 32), а холст может быть любого размера:
// перед кадром ставим масштаб, поэтому картинка чёткая на любом экране.

type Ctx = CanvasRenderingContext2D
type Ready = Shape & { path: Path2D }

const ready = (shape: Shape): Ready => ({...shape, path: new Path2D(shape.d)})

const paint = (ctx: Ctx, shapes: (Shape | Ready)[]) => {
    const alpha = ctx.globalAlpha
    for (const shape of shapes) {
        const path = 'path' in shape ? shape.path : new Path2D(shape.d)
        ctx.globalAlpha = alpha * (shape.o ?? 1)
        if (shape.f) {
            ctx.fillStyle = shape.f
            ctx.fill(path)
        }
        if (shape.s) {
            ctx.strokeStyle = shape.s
            ctx.lineWidth = shape.w ?? 1
            ctx.lineCap = shape.c ?? 'butt'
            ctx.lineJoin = 'round'
            ctx.stroke(path)
        }
    }
    ctx.globalAlpha = alpha
}

// Ящики не меняются — их пути готовим один раз
const CRATE_PATHS = CRATES.map((shapes) => shapes.map(ready))
const HALF = CELL / 64 // герой и ящики нарисованы в сетке 64 на клетку

const roundRect = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, r)
    ctx.fill()
}

// ---------- Склад: стена, окна, стеллажи, лампы, пол ----------
// Фон не меняется, поэтому рисуем его один раз в отдельный холст и перерисовываем только при смене размера
let background: HTMLCanvasElement | null = null

const drawBackground = (ctx: Ctx) => {
    const wall = ctx.createLinearGradient(0, 0, 0, H)
    wall.addColorStop(0, COLORS.wallTop)
    wall.addColorStop(1, COLORS.wallBottom)
    ctx.fillStyle = wall
    ctx.fillRect(0, 0, W, H)

    // Окна
    for (const x of [30, 114, 198]) {
        ctx.fillStyle = COLORS.frame
        roundRect(ctx, x, 60, 60, 75, 5)
        ctx.fillStyle = COLORS.sky
        roundRect(ctx, x + 3, 63, 54, 69, 3)
        ctx.fillStyle = COLORS.frame
        ctx.fillRect(x + 28.5, 60, 3, 75)
        ctx.fillRect(x, 95, 60, 3)
    }

    // Стеллажи с коробками — на заднем плане, приглушённые
    ctx.globalAlpha = 0.55
    for (const x of [10, 178]) {
        ctx.fillStyle = COLORS.shelf
        ctx.fillRect(x, 165, 5, 267)
        ctx.fillRect(x + 95, 165, 5, 267)
        for (const y of [225, 305, 385]) ctx.fillRect(x, y, 100, 5)
        ctx.fillStyle = COLORS.shelfBoxA
        roundRect(ctx, x + 11, 200, 28, 25, 2)
        roundRect(ctx, x + 12, 355, 35, 30, 2)
        ctx.fillStyle = COLORS.shelfBoxB
        roundRect(ctx, x + 46, 208, 20, 17, 2)
        roundRect(ctx, x + 55, 275, 32, 30, 2)
    }
    ctx.globalAlpha = 1

    // Лампы и свет от них
    for (const x of [72, 216]) {
        const light = ctx.createLinearGradient(0, 38, 0, 248)
        light.addColorStop(0, 'rgba(255, 244, 200, 0.5)')
        light.addColorStop(1, 'rgba(255, 244, 200, 0)')
        ctx.fillStyle = light
        ctx.beginPath()
        ctx.moveTo(x - 10, 38)
        ctx.lineTo(x + 10, 38)
        ctx.lineTo(x + 60, 248)
        ctx.lineTo(x - 60, 248)
        ctx.fill()
        ctx.fillStyle = COLORS.beam
        ctx.fillRect(x - 0.5, 12, 1, 20)
        ctx.beginPath()
        ctx.roundRect(x - 11, 31, 22, 9, [11, 11, 2, 2])
        ctx.fill()
        ctx.fillStyle = COLORS.bulb
        ctx.beginPath()
        ctx.roundRect(x - 4, 38, 8, 4, [0, 0, 4, 4])
        ctx.fill()
    }

    // Потолок и рельс крана
    ctx.fillStyle = COLORS.ceiling
    ctx.fillRect(0, 0, W, 8)
    ctx.fillStyle = COLORS.beam
    ctx.fillRect(0, 8, W, 4)

    // Пол с предупреждающей полосой
    const floorY = H - FLOOR
    ctx.fillStyle = COLORS.floor
    ctx.fillRect(0, floorY, W, FLOOR)
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, floorY, W, 2)
    ctx.clip()
    for (let x = -4; x < W + 4; x += 12) {
        ctx.fillStyle = COLORS.stripeA
        ctx.beginPath()
        ctx.moveTo(x, floorY + 2)
        ctx.lineTo(x + 2, floorY)
        ctx.lineTo(x + 8, floorY)
        ctx.lineTo(x + 6, floorY + 2)
        ctx.fill()
        ctx.fillStyle = COLORS.stripeB
        ctx.beginPath()
        ctx.moveTo(x + 6, floorY + 2)
        ctx.lineTo(x + 8, floorY)
        ctx.lineTo(x + 14, floorY)
        ctx.lineTo(x + 12, floorY + 2)
        ctx.fill()
    }
    ctx.restore()
}

const getBackground = (width: number, height: number) => {
    if (background && background.width === width && background.height === height) return background
    background = document.createElement('canvas')
    background.width = width
    background.height = height
    const ctx = background.getContext('2d')
    if (ctx) {
        ctx.scale(width / W, height / H)
        drawBackground(ctx)
    }
    return background
}

// ---------- Ящики и кран ----------
// squash — на сколько ящик присел от удара (0…1): сплющивается к своему дну
const drawBox = (ctx: Ctx, look: number, x: number, y: number, squash = 0) => {
    ctx.save()
    ctx.translate(x + CELL / 2, y + CELL)
    ctx.scale(HALF * (1 + squash * 0.12), HALF * (1 - squash * 0.14))
    ctx.translate(-32, -64)
    paint(ctx, CRATE_PATHS[look] ?? CRATE_PATHS[0])
    ctx.restore()
}

// Тележка на рельсе с захватом; ящик висит под ней
const drawCrane = (ctx: Ctx, x: number, isCarrying: boolean) => {
    ctx.fillStyle = COLORS.beam
    ctx.beginPath()
    ctx.arc(x + 8, 9, 2.5, 0, Math.PI * 2)
    ctx.arc(x + 24, 9, 2.5, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = COLORS.crane
    roundRect(ctx, x + 3, 5, 26, 8, 3)
    ctx.fillStyle = COLORS.craneShade
    roundRect(ctx, x + 6, 9.5, 20, 2, 1)
    ctx.fillStyle = COLORS.beam
    ctx.fillRect(x + 15.5, 13, 1, 2)
    // Захват: сжат на ящике или раскрыт
    const spread = isCarrying ? 0 : 3
    ctx.strokeStyle = COLORS.beam
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(x + 6 - spread, 21)
    ctx.lineTo(x + 6 - spread, 17)
    ctx.lineTo(x + 10, 15)
    ctx.lineTo(x + 22, 15)
    ctx.lineTo(x + 26 + spread, 17)
    ctx.lineTo(x + 26 + spread, 21)
    ctx.stroke()
}

// ---------- Грузчик ----------
// Слой для полупрозрачного грузчика: его рамка 32×64 с запасом на вытянутые руки
const LAYER_PAD = 24
const LAYER_W = CELL + LAYER_PAD * 2
const LAYER_H = CELL * 2 + LAYER_PAD * 2
let heroLayer: HTMLCanvasElement | null = null

const getHeroLayer = (width: number, height: number) => {
    heroLayer ??= document.createElement('canvas')
    if (heroLayer.width !== width || heroLayer.height !== height) {
        heroLayer.width = width
        heroLayer.height = height
    }
    return heroLayer
}

// Высота опоры, над которой сейчас грузчик: на ней лежит его тень
const supportY = (p: Player, y: number) => {
    if (p.mode === 'jump' || p.mode === 'fall') return p.row
    if (p.mode === 'move' && p.hop) return p.t / MOVE_T < 0.5 ? p.row - 1 : p.row // запрыгивает на ящик: сначала тень на старой опоре
    return p.mode === 'move' ? p.row : y
}

const drawPlayer = (ctx: Ctx, p: Player, time: number, dt: number) => {
    const pos = playerPos(p)
    const hero = drawHero(heroPose(p, time, dt))
    const x = pos.x * CELL
    const base = supportY(p, pos.y)
    const height = Math.max(0, pos.y - base)

    // Тень остаётся на опоре и уменьшается с высотой
    ctx.fillStyle = `rgba(0, 0, 0, ${0.22 / (1 + height)})`
    ctx.beginPath()
    ctx.ellipse(x + hero.shadowX * HALF, yToScreen(base), 6.5 / (1 + height * 0.5), 1.1, 0, 0, Math.PI * 2)
    ctx.fill()

    const paintHero = (target: Ctx) => {
        target.scale(HALF, HALF)
        target.save()
        target.translate(hero.cx, 126)
        target.scale(hero.sx, hero.sy)
        target.translate(-hero.cx, -126)
        paint(target, hero.shapes)
        target.restore()
        paint(target, hero.fx)
    }
    const top = yToScreen(pos.y) - 126 * HALF

    // После воскрешения грузчик мерцает. Полупрозрачным его рисуем через отдельный слой:
    // иначе детали просвечивали бы друг сквозь друга
    const isFaded = p.invul > 0 && p.dead <= 0 && Math.floor(p.invul * 10) % 2 === 0
    if (!isFaded) {
        ctx.save()
        ctx.translate(x, top)
        paintHero(ctx)
        ctx.restore()
        return
    }
    const scale = ctx.canvas.width / W
    const layer = getHeroLayer(Math.ceil(LAYER_W * scale), Math.ceil(LAYER_H * scale))
    const layerCtx = layer.getContext('2d')
    if (!layerCtx) return
    layerCtx.setTransform(1, 0, 0, 1, 0, 0)
    layerCtx.clearRect(0, 0, layer.width, layer.height)
    layerCtx.setTransform(scale, 0, 0, scale, LAYER_PAD * scale, LAYER_PAD * scale)
    paintHero(layerCtx)
    ctx.globalAlpha = 0.4
    ctx.drawImage(layer, x - LAYER_PAD, top - LAYER_PAD, layer.width / scale, layer.height / scale)
    ctx.globalAlpha = 1
}

// ---------- Кадр ----------
// time — секунды (для дыхания и моргания), dt — сколько прошло с прошлого кадра
export const draw = (ctx: Ctx, game: Game, time: number, dt: number) => {
    const canvas = ctx.canvas
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(getBackground(canvas.width, canvas.height), 0, 0)
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0)

    for (const crane of game.cranes) {
        const x = crane.x * CELL
        if (crane.carrying) drawBox(ctx, crane.look, x, 16)
        drawCrane(ctx, x, crane.carrying)
    }

    for (let r = 0; r < game.grid.length; r++) {
        for (let c = 0; c < COLS; c++) {
            const box = game.grid[r][c]
            if (!box) continue
            const slideOffset = box.slide > 0 ? box.slideFrom * (box.slide / MOVE_T) * CELL : 0
            const sinceLanded = game.time - box.landed
            const squash = sinceLanded < 0.14 ? Math.sin((sinceLanded / 0.14) * Math.PI) : 0
            const x = c * CELL + slideOffset
            const y = yToScreen(r + 1)
            drawBox(ctx, box.look, x, y, squash)
            // Собранный ряд вспыхивает белым и гаснет
            if (game.clearing?.rows.includes(r)) {
                const k = game.clearing.t / CLEAR_TIME
                ctx.fillStyle = `rgba(255, 255, 255, ${0.35 + 0.5 * Math.abs(Math.sin(k * Math.PI * 3))})`
                roundRect(ctx, x + 0.5, y + 0.5, CELL - 1, CELL - 1, 3)
            }
        }
    }

    for (const b of game.falling) drawBox(ctx, b.look, b.col * CELL, yToScreen(b.y + 1))

    drawPlayer(ctx, game.player, time, dt)

    ctx.textAlign = 'center'
    for (const f of game.fx) {
        if (f.kind === 'bit') {
            ctx.globalAlpha = Math.min(1, f.t * 3)
            ctx.fillStyle = CRATE_CHIPS[f.look] ?? CRATE_CHIPS[0]
            ctx.save()
            ctx.translate(f.x, f.y)
            ctx.rotate(f.t * 14)
            ctx.fillRect(-2, -1.2, 4, 2.4)
            ctx.restore()
            ctx.globalAlpha = 1
        } else if (f.kind === 'dust') {
            ctx.globalAlpha = Math.min(0.45, f.t * 1.6)
            ctx.fillStyle = COLORS.dust
            ctx.beginPath()
            ctx.arc(f.x, f.y, 2 + (0.45 - f.t) * 6, 0, Math.PI * 2)
            ctx.fill()
            ctx.globalAlpha = 1
        } else if (f.kind === 'text') {
            ctx.globalAlpha = Math.min(1, f.t * 2)
            ctx.font = `800 13px ${FONT}`
            ctx.lineWidth = 3
            ctx.lineJoin = 'round'
            ctx.strokeStyle = COLORS.text
            ctx.strokeText(f.text, f.x, f.y)
            ctx.fillStyle = COLORS.textLight
            ctx.fillText(f.text, f.x, f.y)
            ctx.globalAlpha = 1
        } else {
            ctx.fillStyle = `rgba(214, 48, 49, ${f.t * 1.6})`
            ctx.fillRect(0, 0, W, H)
        }
    }
}
