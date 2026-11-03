import {CELL, COLORS, COLS, FONT, H, MOVE_T, W} from './config.ts'
import {LOOKS} from './sprites.ts'
import {type Game, manFrame, playerPos, yToScreen} from './game.ts'

// Рисует спрайт из строк: X — цветом color, o — светлым
const sprite = (ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string, scale = 4) => {
    for (let r = 0; r < rows.length; r++) {
        const row = rows[r]
        for (let c = 0; c < row.length; c++) {
            const ch = row[c]
            if (ch === '.') continue
            ctx.fillStyle = ch === 'o' ? COLORS.light : color
            ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale)
        }
    }
}

const drawBox = (ctx: CanvasRenderingContext2D, look: number, x: number, y: number) => {
    ctx.fillStyle = COLORS.light
    ctx.fillRect(x + 4, y + 4, CELL - 8, CELL - 8)
    sprite(ctx, LOOKS[look], x, y, COLORS.dark)
}

// Потолок склада с растровой штриховкой и рельс крана
const drawCeiling = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = COLORS.mid
    for (let y = 0; y < 8; y += 4) {
        for (let x = ((y / 4) % 2) * 4; x < W; x += 8) ctx.fillRect(x, y, 4, 4)
    }
    ctx.fillStyle = COLORS.dark
    ctx.fillRect(0, 8, W, 4)
    ctx.fillStyle = COLORS.mid
    for (let x = 0; x < W; x += 16) ctx.fillRect(x, 12, 4, 4)
}

export const draw = (ctx: CanvasRenderingContext2D, game: Game) => {
    ctx.fillStyle = COLORS.lcd
    ctx.fillRect(0, 0, W, H)
    drawCeiling(ctx)

    for (const crane of game.cranes) {
        const x = crane.x * CELL
        ctx.fillStyle = COLORS.dark
        ctx.fillRect(x + 4, 4, CELL - 8, 12)
        ctx.fillRect(x + 14, 16, 4, 10)
        if (crane.carrying) drawBox(ctx, crane.look, x, 22)
    }

    for (let r = 0; r < game.grid.length; r++) {
        for (let c = 0; c < COLS; c++) {
            const box = game.grid[r][c]
            if (!box) continue
            // Собранный ряд мигает перед исчезновением
            const isFlashing = game.clearing?.rows.includes(r) && Math.floor(game.clearing.t * 12) % 2 === 0
            if (isFlashing) continue
            const slideOffset = box.slide > 0 ? box.slideFrom * (box.slide / MOVE_T) * CELL : 0
            drawBox(ctx, box.look, c * CELL + slideOffset, yToScreen(r + 1))
        }
    }

    for (const b of game.falling) drawBox(ctx, b.look, b.col * CELL, yToScreen(b.y + 1))

    // После воскрешения грузчик мигает
    const p = game.player
    const isBlink = p.invul > 0 && p.dead <= 0 && Math.floor(p.invul * 10) % 2 === 0
    if (!isBlink) {
        const pos = playerPos(p)
        sprite(ctx, manFrame(p), pos.x * CELL, yToScreen(pos.y) - 64, COLORS.dark, 2)
    }

    ctx.textAlign = 'center'
    for (const f of game.fx) {
        if (f.kind === 'bit') {
            ctx.fillStyle = COLORS.dark
            ctx.fillRect(Math.round(f.x), Math.round(f.y), 4, 4)
        } else if (f.kind === 'text') {
            ctx.globalAlpha = Math.min(1, f.t * 2)
            ctx.fillStyle = COLORS.dark
            ctx.font = `12px ${FONT}`
            ctx.fillText(f.text, f.x, f.y)
            ctx.globalAlpha = 1
        } else {
            ctx.fillStyle = `rgba(59, 29, 11, ${f.t})`
            ctx.fillRect(0, 0, W, H)
        }
    }
}
