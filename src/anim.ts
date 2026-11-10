import {CRUSH_T, JUMP_T, LAND_T, MOVE_T} from './config.ts'
import type {Player} from './game.ts'
import {crushedPose, fallPose, hopPose, idlePose, jumpPose, landPose, mixPose, type Pose, pushPose, runPose} from './hero.ts'

// «Режиссёр»: по состоянию грузчика выбирает позу и сглаживает переходы между ними.
// Отдельных анимаций поворота нет: корпус сам доворачивается за пару кадров, пока грузчик уже шагает.

let current: Pose | null = null
let look = 0 // куда повёрнута голова, −1…1
let yaw = 0

// Стоя вертит головой: прямо, влево, прямо, вправо — по 0,7 секунды
const LOOKS = [0, -1, 0, 1]

const targetPose = (p: Player, time: number): Pose => {
    if (p.dead > 0) return crushedPose(CRUSH_T - p.dead)
    if (p.mode === 'jump') return jumpPose(Math.min(1, p.jt / JUMP_T))
    if (p.mode === 'fall') return fallPose(time)
    if (p.mode === 'move') {
        const k = Math.min(1, p.t / MOVE_T)
        if (p.hop) return hopPose(k, p.facing)
        // Один шаг на клетку — половина цикла бега; walkFrame чередует ноги
        const phase = (p.walkFrame + k) / 2
        return p.pushing ? pushPose(phase, p.facing) : runPose(phase, p.facing)
    }
    const idle = idlePose(time)
    return p.landT < LAND_T ? landPose(p.landT / LAND_T, idle) : idle
}

const follow = (dt: number, time: number) => 1 - Math.exp(-dt / time)

export const heroPose = (p: Player, time: number, dt: number): Pose => {
    const target = targetPose(p, time)
    const isIdle = p.mode === 'idle' && p.dead <= 0
    const wantLook = isIdle ? LOOKS[Math.floor(p.idleT / 0.7) % 4] : 0
    look += (wantLook - look) * follow(dt, isIdle ? 0.09 : 0.04)

    if (!current || p.dead > 0) {
        current = target
        yaw = target.yaw
    } else {
        current = mixPose(current, target, follow(dt, isIdle ? 0.05 : 0.032))
        // Поворот корпуса чуть медленнее остального, чтобы его было видно
        yaw += (target.yaw - yaw) * follow(dt, isIdle ? 0.06 : 0.045)
    }
    return {...current, yaw, headYaw: current.headYaw + look * 62, expr: target.expr, blink: target.blink, helmet: p.helmet}
}

// После новой игры поза начинается с чистого листа
export const resetHeroAnim = () => {
    current = null
    look = 0
    yaw = 0
}
