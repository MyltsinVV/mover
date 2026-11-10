// Грузчик: одна объёмная модель на суставах.
// Тело задано в своих координатах [вбок, вниз, вперёд] и проецируется на экран с поворотом yaw
// (0 — лицом к нам, 90 — вправо, −90 — влево). Поза — набор углов суставов, на выходе — список фигур
// для canvas. Кадр героя — 64×128 единиц (одна клетка в ширину, две в высоту), пол на y = 126.

export type Shape = {
    d: string // путь в формате SVG
    f?: string // заливка
    s?: string // обводка
    w?: number // толщина обводки
    c?: CanvasLineCap
    o?: number // прозрачность
}

type Vec = [number, number, number]
type Pt = [number, number, number?]

export type Expr = 'calm' | 'focus' | 'wow' | 'hurt'
// sw — мах вперёд, sp — отведение наружу, el — сгиб локтя, sp2 — отведение предплечья
type Arm = { sw: number, sp: number, el: number, sp2: number }
// kn — сгиб колена, ft — наклон стопы (плюс — носок вниз), sp2 — отведение голени
type Leg = { sw: number, sp: number, kn: number, ft: number, sp2: number }
type Target = { f: number, y: number }

export type Pose = {
    yaw: number
    headYaw: number
    headPitch: number
    lean: number // наклон корпуса вперёд
    k: number // растяжение корпуса
    back: number // сдвиг таза назад (минус) относительно центра клетки
    air: number // высота таза в воздухе относительно стойки
    airMix: number // 0 — стоит на подошвах, 1 — висит в воздухе
    sx: number // сплющивание всей фигуры
    sy: number
    dizzy: number // звёздочки над головой
    time: number
    reachMix: number // 0 — руки по углам, 1 — ладони тянутся к reach
    reach: { L: Target, R: Target } | null
    aL: Arm
    aR: Arm
    lL: Leg
    lR: Leg
    expr: Expr
    blink: boolean
    helmet: number // сколько ударов ещё выдержит каска
}

const C = {
    skin: '#f2c29b', skinShade: '#dba07a', skinDeep: '#c4835c', hair: '#5b3a24', hairLight: '#7a5033',
    blush: '#f08a7a', ink: '#2a2230', mouth: '#8a4038', shirt: '#3f6fb0', shirtShade: '#30598f', shirtDeep: '#28497a',
    vest: '#ff7a1a', vestShade: '#e0600b', reflect: '#eef2f7', reflectShade: '#c3ccd8',
    pants: '#2e4a73', pantsShade: '#223a5c', boot: '#6b4429', bootShade: '#4f311c', sole: '#2a1d15',
    glove: '#e8c27a', gloveShade: '#c49d58', gloveDeep: '#a8823f', buckle: '#cfd6df',
    helmet: '#ffc531', helmetShade: '#e09f0b', helmetDeep: '#8f6200', helmetLight: '#ffe38f', star: '#ffd23f',
}

const D = Math.PI / 180
const GROUND = 126
const HIP0 = 78.75
const THIGH = 22.5
const SHIN = 18.5
const UPPER = 20.5
const FORE = 14

// ---------- Математика ----------
const n = (v: number) => Math.round(v * 100) / 100
const cl = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const sstep = (a: number, b: number, x: number) => {
    const t = cl((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
}
const hex2 = (v: number) => Math.round(cl(v, 0, 255)).toString(16).padStart(2, '0')
const mix = (c1: string, c2: string, t: number) => {
    if (t <= 0) return c1
    if (t >= 1) return c2
    const a = parseInt(c1.slice(1), 16)
    const b = parseInt(c2.slice(1), 16)
    return '#' + hex2(lerp(a >> 16, b >> 16, t)) + hex2(lerp((a >> 8) & 255, (b >> 8) & 255, t)) + hex2(lerp(a & 255, b & 255, t))
}
const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const mul = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k, a[2] * k]
const unit = (u: Vec): Vec => {
    const q = Math.hypot(u[0], u[1], u[2]) || 1
    return [u[0] / q, u[1] / q, u[2] / q]
}
// Направление сустава; side: +1 — левая сторона героя, −1 — правая
const dir = (sw: number, sp: number, side: number): Vec => {
    const c = Math.cos(sp * D)
    return [side * Math.sin(sp * D), c * Math.cos(sw * D), c * Math.sin(sw * D)]
}

// ---------- Пути ----------
const xy = (p: Pt) => n(p[0]) + ' ' + n(p[1])

// Замкнутый многоугольник; обход всегда по часовой, чтобы несколько кусков в одном пути не вырезали друг друга
const poly = (points: Pt[]) => {
    let area = 0
    for (let i = 0; i < points.length; i++) {
        const q = points[(i + 1) % points.length]
        area += points[i][0] * q[1] - q[0] * points[i][1]
    }
    const list = area < 0 ? points.slice().reverse() : points
    return 'M ' + list.map(xy).join(' L ') + ' Z'
}

const line = (points: Pt[]) => 'M ' + points.map(xy).join(' L ')

const ell = (cx: number, cy: number, rx: number, ry: number) => {
    const ox = rx * 0.5523
    const oy = ry * 0.5523
    return `M ${n(cx - rx)} ${n(cy)} C ${n(cx - rx)} ${n(cy - oy)} ${n(cx - ox)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}`
        + ` C ${n(cx + ox)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - oy)} ${n(cx + rx)} ${n(cy)}`
        + ` C ${n(cx + rx)} ${n(cy + oy)} ${n(cx + ox)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}`
        + ` C ${n(cx - ox)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + oy)} ${n(cx - rx)} ${n(cy)} Z`
}

// Плавная линия через точки (без начального M)
const curveThrough = (pts: Pt[]) => {
    let s = ''
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        s += ` C ${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)}`
            + ` ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${xy(p2)}`
    }
    return s
}

// Преобразование всех точек пути (в путях только M L Q C Z и пары чисел)
const mapPath = (d: string, fn: (x: number, y: number) => [number, number]) => {
    const tokens = d.split(' ')
    const out: (string | number)[] = []
    let i = 0
    while (i < tokens.length) {
        const v = tokens[i]
        if (v === '') {
            i++
            continue
        }
        if (/^[A-Za-z]$/.test(v)) {
            out.push(v)
            i++
            continue
        }
        const p = fn(parseFloat(v), parseFloat(tokens[i + 1]))
        out.push(n(p[0]), n(p[1]))
        i += 2
    }
    return out.join(' ')
}

const mirrorX = (d: string) => mapPath(d, (x, y) => [64 - x, y])

type PathNums = (string | number)[]
const nums = (d: string): PathNums => d.split(' ').map((v) => (/^[A-Za-z]$/.test(v) ? v : parseFloat(v)))
const lerpPath = (a: PathNums, b: PathNums, t: number) =>
    a.map((v, i) => (typeof v === 'string' ? v : n(lerp(v, b[i] as number, t)))).join(' ')

// Сегмент конечности: трапеция между двумя точками. f0…f1 — какую полосу ширины взять
const segPts = (p0: Pt, p1: Pt, w0: number, w1: number, f0: number, f1: number): Pt[] | null => {
    const dx = p1[0] - p0[0]
    const dy = p1[1] - p0[1]
    const l = Math.hypot(dx, dy)
    if (l < 0.3) return null
    let nx = -dy / l
    let ny = dx / l
    // Нормаль смотрит вправо-вниз: туда ложится тень (свет слева сверху)
    if (nx * 0.75 + ny * 0.45 < 0) {
        nx = -nx
        ny = -ny
    }
    return [
        [p0[0] + nx * w0 * f0, p0[1] + ny * w0 * f0], [p1[0] + nx * w1 * f0, p1[1] + ny * w1 * f0],
        [p1[0] + nx * w1 * f1, p1[1] + ny * w1 * f1], [p0[0] + nx * w0 * f1, p0[1] + ny * w0 * f1],
    ]
}

const limbPath = (pts: Pt[], ws: number[], capStart: boolean) => {
    const parts: string[] = []
    for (let i = 0; i < pts.length - 1; i++) {
        const q = segPts(pts[i], pts[i + 1], ws[i], ws[i + 1], -0.5, 0.5)
        if (q) parts.push(poly(q))
    }
    for (let j = capStart ? 0 : 1; j < pts.length - 1; j++) parts.push(ell(pts[j][0], pts[j][1], ws[j] / 2, ws[j] / 2))
    return parts.join(' ')
}

// Тень на конечности — одна полоса через сустав
const limbShade = (pts: Pt[], ws: number[]) => {
    const inner: Pt[] = []
    const outer: Pt[] = []
    let sign = 0
    for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)]
        const b = pts[Math.min(pts.length - 1, i + 1)]
        const dx = b[0] - a[0]
        const dy = b[1] - a[1]
        const l = Math.hypot(dx, dy)
        if (l < 0.3) return ''
        if (!sign) sign = (-dy / l) * 0.75 + (dx / l) * 0.45 < 0 ? -1 : 1
        const nx = (-dy / l) * sign
        const ny = (dx / l) * sign
        inner.push([pts[i][0] + nx * ws[i] * 0.16, pts[i][1] + ny * ws[i] * 0.16])
        outer.push([pts[i][0] + nx * ws[i] * 0.5, pts[i][1] + ny * ws[i] * 0.5])
    }
    return poly(inner.concat(outer.reverse()))
}

// ---------- Голова ----------
// Профиль нарисован отдельно; между «лицом к нам» и профилем контур плавно перетекает
const FACE_PROFILE = nums('M 23.4 23 Q 23.4 15.6 32 15.6 Q 40.4 15.6 41.2 22 L 41.6 25.2 Q 41.5 26.6 41 27.6 L 41.2 31.6 Q 41.8 32.6 41.3 33.4 Q 41.8 34.4 41.2 35.2 Q 41.2 37.4 38.6 37.9 Q 35.6 38.4 33.4 37 Q 29 35.4 27 33 Q 23.6 31 23.4 28 Z')
const JAW_PROFILE = 'M 41.2 35.2 Q 41.2 37.4 38.6 37.9 Q 35.6 38.4 33.4 37 Q 36.4 36.8 38.8 36 Q 40.6 35.6 41.2 35.2 Z'

// Линия волос по углу на голове (0 — лицо, 90 — ухо, 180 — затылок)
const hairline = (angle: number) => {
    const a = Math.abs(angle)
    return 21.8 + (26 - 21.8) * sstep(42, 60, a) + (24.2 - 26) * sstep(70, 80, a) + (31.5 - 24.2) * sstep(102, 128, a)
}

const headShapes = (yawFull: number, expr: Expr, blink: boolean, helmet: number): Shape[] => {
    const out: Shape[] = []
    const F = (d: string, f: string, o?: number) => out.push({d, f, o})
    const S = (d: string, s: string, w: number, o?: number) => out.push({d, s, w, c: 'round', o})
    const th = cl(yawFull, -90, 90) * 75 / 90
    const ath = Math.abs(th)
    const sg = th < 0 ? -1 : 1
    const p = sstep(50, 75, ath) // насколько это уже профиль
    const sx = (a: number, r: number) => 32 + r * Math.sin((a + th) * D)
    const vis = (a: number) => Math.cos((a + th) * D)
    const s = Math.sin(th * D)

    // Контур лица считаем для поворота вправо, для левого — зеркалим
    const yn = ath / 75
    const lx = 23 + yn * 0.5
    const rx = 41 + yn * 0.5
    const chin = 32 + 5 * Math.sin(ath * D)
    const front: PathNums = [
        'M', lx, 23, 'Q', lx, 15.6, 32, 15.6, 'Q', rx, 15.6, rx, 22, 'L', rx, 25.2, 'Q', rx, 26.4, rx, 27.6,
        'L', rx - 0.5, 30.6, 'Q', rx - 0.7, 31.6, rx - 1.2, 32.6, 'Q', rx - 1.5, 33.1, rx - 1.8, 33.5,
        'Q', chin + 5.2, 37.1, chin + 1.4, 37.9, 'Q', chin, 38.1, chin - 1.4, 37.9,
        'Q', chin - 5.2, 37.1, lx + 1.8, 33.4, 'Q', lx + 0.2, 31, lx, 28, 'Z',
    ]
    let face = lerpPath(front, FACE_PROFILE, p)
    if (sg < 0) face = mirrorX(face)

    // Уши на ±90° от лица: дальнее прячется за головой, ближнее выезжает на щёку
    const earL = sx(-90, 9.4)
    const earR = sx(90, 9.4)
    F(ell(earL, 27.6, 1.9, 2.9), C.skinShade)
    F(ell(earR, 27.6, 1.9, 2.9), C.skinShade)
    F(face, C.skin)

    // Тень на челюсти: спереди — справа (свет слева), в профиль — под подбородком
    const sRx = 41 + (th / 75) * 0.5
    const sChin = 32 + 5 * s
    if (p < 1) {
        F(`M ${n(sRx)} 27 Q ${n(sRx - 0.2)} 31 ${n(sRx - 1.6)} 33.8 Q ${n(sChin + 5.2)} 37.1 ${n(sChin + 1.4)} 37.9`
            + ` Q ${n(sChin + 3.6)} 35.6 ${n(sRx - 1.4)} 31 Z`, C.skinShade, 0.55 * (1 - p))
    }
    if (p > 0) F(sg < 0 ? mirrorX(JAW_PROFILE) : JAW_PROFILE, C.skinShade, 0.55 * p)

    // Волосы — сплошная полоса под каской; без каски — шапка волос с вихром
    const top: Pt[] = []
    const bottom: Pt[] = []
    const hairTop = helmet > 0 ? 20.4 : 14.4
    for (let a = -180; a <= 180; a += 4) {
        if (Math.cos((a + th) * D) < 0) continue
        const x = sx(a, 9.5)
        const hy = hairline(a)
        top.push([x, hairTop])
        bottom.push([32 + (x - 32) * (1 - 0.13 * Math.max(0, hy - 24) / 7.5), hy])
    }
    if (top.length > 1) {
        bottom.reverse()
        if (helmet > 0) F(poly(top.concat(bottom)), C.hair)
        else {
            const x0 = top[0][0]
            const x1 = top[top.length - 1][0]
            F(`M ${n(x0)} ${n(hairTop + 6)} Q ${n(x0 - 0.2)} 12.2 32 12 Q ${n(x1 + 0.2)} 12.2 ${n(x1)} ${n(hairTop + 6)} L `
                + bottom.map(xy).join(' L ') + ' Z', C.hair)
            const fx = sx(0, 8.6)
            const f1 = sx(-38, 9.4)
            const f2 = sx(38, 9.4)
            if (vis(0) > 0.1) {
                F(`M ${n(f1)} 21.6 Q ${n(lerp(f1, fx, 0.5))} 24.6 ${n(fx - 0.6)} 22.4 Q ${n(lerp(fx, f2, 0.5))} 24.8 ${n(f2)} 21.6`
                    + ` L ${n(f2)} 18 L ${n(f1)} 18 Z`, C.hair)
            }
            S(`M ${n(sx(-18, 6))} 15.4 Q ${n(sx(-6, 5))} 13.4 ${n(sx(8, 5.6))} 13.8`, C.hairLight, 1.2, 0.9)
            const tx = sx(6, 2.4)
            F(`M ${n(tx - 2.2)} 12.8 Q ${n(tx - 0.4)} 8.2 ${n(tx + 3.4)} 9.6 Q ${n(tx + 1)} 10.6 ${n(tx + 1.6)} 12.8 Z`, C.hair)
        }
    }
    if (ath > 11) {
        const ex = sg > 0 ? earL : earR
        out.push({d: ell(ex, 27.8, 1.9 * Math.max(0.55, Math.abs(s) * 1.2), 2.9), f: C.skin, s: C.skinShade, w: 0.6})
        S(`M ${n(ex + sg * 0.5)} 26.4 Q ${n(ex - sg * 0.5)} 27.6 ${n(ex + sg * 0.4)} 29.2`, C.skinDeep, 0.6)
    }

    // Румянец, глаза, брови
    for (const a of [-34, 34]) {
        const v = vis(a)
        if (v > 0.05) F(ell(sx(a, 9.4), 31.4, 1.8 * v, 1.3), C.blush, 0.35)
    }
    const browUp = expr === 'wow' ? -1.3 : expr === 'hurt' ? -0.4 : 0
    const browIn = expr === 'focus' ? 0.9 : expr === 'hurt' ? -0.9 : 0
    for (const a of [-22, 22]) {
        const v = vis(a)
        if (v <= 0.12) continue
        const k = Math.max(0.3, v)
        const e = sx(a, 9.6)
        if (expr === 'hurt') {
            S(`M ${n(e - 1.3 * k)} 25.8 L ${n(e + 1.3 * k)} 28.2 M ${n(e + 1.3 * k)} 25.8 L ${n(e - 1.3 * k)} 28.2`, C.ink, 0.9)
        } else if (blink) {
            S(`M ${n(e - 1.3 * k)} 27 Q ${n(e)} 27.9 ${n(e + 1.3 * k)} 27`, C.ink, 0.8)
        } else {
            F(ell(e, 27, 1.35 * k, expr === 'wow' ? 2.1 : 1.8), C.ink)
            F(ell(e + 0.4 * k, 26.3, k > 0.5 ? 0.45 : 0.3, k > 0.5 ? 0.45 : 0.3), '#ffffff')
        }
        // Внутренний край брови (ближе к носу) опускается, когда сосредоточен
        const isLeftEye = a < 0
        S(`M ${n(e - 1.6 * k)} ${n(24.2 + browUp + (isLeftEye ? -browIn * 0.4 : browIn))} Q ${n(e)} ${n(23.4 + browUp)}`
            + ` ${n(e + 1.6 * k)} ${n(24.2 + browUp + (isLeftEye ? browIn : -browIn * 0.4))}`, C.hair, 1)
    }

    // Нос: в профиль выступает за контур лица
    const nx = sx(0, 10 - 0.6 * p)
    const tip = s * (2.8 - p)
    F(`M ${n(nx - s * 0.8)} 26.6 Q ${n(nx + tip * 0.7)} 28.6 ${n(nx + tip)} 30.6 Q ${n(nx + tip * 1.05)} 31.8 ${n(nx + tip * 0.4)} 31.8`
        + ` L ${n(nx - s * 0.6)} 31.6 Z`, C.skin)
    F(`M ${n(nx - 0.2 - s * 0.4)} 28 Q ${n(nx + 0.9 * (1 - p) + tip * 0.6)} 30.4 ${n(nx + (1 - p) + tip * 0.8)} 31.3`
        + ` Q ${n(nx + tip * 0.3)} 32.1 ${n(nx - 1.1 * (1 - p) + tip * 0.2)} 31.4 Q ${n(nx - 0.2)} 31 ${n(nx - 0.2 - s * 0.4)} 28 Z`,
    C.skinShade, 1 - 0.45 * p)

    // Рот: считаем для поворота вправо и зеркалим
    const ms = (a: number, r: number) => 32 + r * Math.sin((a + ath) * D)
    const limit = lerp(99, 41.25, p)
    const m1 = Math.min(lerp(ms(-16, 9.4), 39.4, p), limit)
    const mc = Math.min(lerp(ms(0, 9.8), 40.4, p), limit)
    const m2 = Math.min(lerp(ms(16, 9.4), 41.2, p), limit)
    let mouth: string
    let mouthFill: string | undefined
    if (expr === 'wow') {
        mouth = ell(mc - 0.2 * p, 34.5, 1 - 0.35 * p, 1.6)
        mouthFill = C.mouth
    } else if (expr === 'focus') {
        mouth = `M ${n(m1 + 0.5 * (1 - p))} 34.4 Q ${n(mc)} 33.9 ${n(m2 - 0.5 * (1 - p))} 34.4`
    } else if (expr === 'hurt') {
        mouth = `M ${n(m1)} 34.8 Q ${n(lerp(m1, mc, 0.5))} 33.4 ${n(mc)} 34.6 Q ${n(lerp(mc, m2, 0.5))} 35.8 ${n(m2)} 34.4`
    } else {
        mouth = `M ${n(m1)} 34 Q ${n(mc)} ${n(35.3 - p)} ${n(m2)} ${n(34 - 0.2 * p)}`
    }
    if (sg < 0) mouth = mirrorX(mouth)
    out.push({d: mouth, f: mouthFill, s: C.mouth, w: 0.8, c: 'round'})

    // Каска: купол, ребро и козырёк поворачиваются с головой, блик остаётся слева
    if (helmet > 0) {
        F('M 21.4 21 Q 21 8.6 32 8.4 Q 43 8.6 42.6 21 Z', C.helmet)
        S(`M ${n(sx(0, 3))} 9.2 Q ${n(sx(0, 9))} 12 ${n(sx(0, 10.6))} 19.8`, C.helmetShade, 2.4)
        S('M 24.4 15.6 Q 25.6 11.4 30 10.2', C.helmetLight, 1.4)
        // Трещины: после первого удара — одна, после второго — две и скол
        const crack = (a0: number, flip: number) => {
            if (vis(a0) < 0.15) return
            const q = (da: number, r: number, y: number) => n(sx(a0 + da * flip, r)) + ' ' + y
            S(`M ${q(0, 10.4, 19.8)} L ${q(5, 9.6, 17.2)} L ${q(-3, 8.9, 15.6)} L ${q(4, 7.6, 13.4)}`
                + ` M ${q(5, 9.6, 17.2)} L ${q(12, 9.6, 16.2)}`, C.helmetDeep, 0.8)
        }
        if (helmet <= 2) crack(-34, 1)
        if (helmet <= 1) {
            crack(30, -1)
            if (vis(52) > 0.2) F(`M ${n(sx(46, 10.6))} 19.4 L ${n(sx(52, 10.4))} 17.2 L ${n(sx(58, 10.6))} 19.4 Z`, C.helmetDeep)
        }
        let v1 = 32 + 11.2 * Math.sin(Math.max(-90, th - 62) * D) - 0.6
        let v2 = 32 + 11.2 * Math.sin(Math.min(90, th + 62) * D) + 0.6
        const peak = s * 3.2
        if (peak > 0) v2 += peak
        else v1 += peak
        const vm = sx(0, 11) + s * 1.6
        F(`M ${n(v1)} 19.6 Q ${n(vm)} 18.2 ${n(v2)} 19.6 Q ${n(v2 + 0.4)} 21.4 ${n(v2 - 1.2)} 22 Q ${n(vm)} 20.8 ${n(v1 + 1.2)} 22`
            + ` Q ${n(v1 - 0.4)} 21.4 ${n(v1)} 19.6 Z`, C.helmetShade)
        S(`M ${n(v1 + 1)} 19.5 Q ${n(vm)} 18.4 ${n(v2 - 1)} 19.5`, C.helmet, 0.7)
    }
    return out
}

// ---------- Тело ----------
// Сечения корпуса и таза: [высота на рисунке, полуширина, полуглубина]
const TORSO = [[40.8, 4.8, 4.0], [42.2, 10.6, 6.8], [45, 11.0, 7.6], [52, 11.3, 8.2], [60, 11.3, 8.1], [71.8, 10.9, 7.6]]
const PELVIS = [[70, 10.7, 7.4], [76, 10.9, 7.2], [80.8, 10.6, 6.4]]

export type HeroDrawing = {
    shapes: Shape[] // тело — рисуется со сплющиванием sx, sy вокруг точки (cx, 126)
    fx: Shape[] // звёздочки — поверх, без сплющивания
    sx: number
    sy: number
    cx: number
    shadowX: number // где рисовать тень под ногами
}

export const drawHero = (P: Pose): HeroDrawing => {
    const cs = Math.cos(P.yaw * D)
    const sn = Math.sin(P.yaw * D)
    const out: Shape[] = []
    const F = (d: string, f: string, o?: number) => {
        if (d) out.push({d, f, o})
    }
    const S = (d: string, s: string, w: number, c: CanvasLineCap = 'round') => out.push({d, s, w, c})
    const pr = (v: Vec): Vec => [32 + v[0] * cs + v[2] * sn, v[1], -v[0] * sn + v[2] * cs]
    const sinL = Math.sin(P.lean * D)
    const cosL = Math.cos(P.lean * D)

    // --- Ноги: сначала относительно таза, чтобы найти высоту, на которой подошвы стоят на полу
    const legCalc = (spec: Leg, side: number) => {
        const hip: Vec = [side * 5.5, 0, P.back - 0.3]
        const knee = add(hip, mul(dir(spec.sw, spec.sp, side), THIGH))
        const shin = dir(spec.sw - spec.kn, spec.sp2, side)
        const ankle = add(knee, mul(shin, SHIN))
        const pitch = spec.ft * D
        const fwd: Vec = [side * 0.16 * Math.cos(pitch), Math.sin(pitch), 0.987 * Math.cos(pitch)]
        const down: Vec = [0, Math.cos(pitch), -Math.sin(pitch)]
        const heelB = add(add(ankle, mul(down, 5.8)), mul(fwd, -3.6))
        const toeB = add(add(ankle, mul(down, 5.8)), mul(fwd, 8.6))
        return {
            hip, knee, ankle, shin, heelB, toeB,
            heelC: add(add(ankle, mul(down, 2.3)), mul(fwd, -1)),
            toeC: add(add(ankle, mul(down, 2.5)), mul(fwd, 6)),
            low: Math.max(heelB[1], toeB[1]) + 0.95,
        }
    }
    type LegCalc = ReturnType<typeof legCalc>
    const legs = [legCalc(P.lL, 1), legCalc(P.lR, -1)]
    const hipGround = GROUND - Math.max(legs[0].low, legs[1].low)
    const hipY = lerp(hipGround, HIP0 + P.air, P.airMix)
    const up = (v: Vec): Vec => [v[0], v[1] + hipY, v[2]]

    // --- Корпус: сечения-эллипсы вдоль позвоночника, наклон lean вперёд
    const rowAt = (table: number[][], yArt: number, isTorso: boolean) => {
        let i = 0
        while (i < table.length - 2 && yArt > table[i + 1][0]) i++
        const t = cl((yArt - table[i][0]) / (table[i + 1][0] - table[i][0]), 0, 1)
        const h = (HIP0 - yArt) * (isTorso ? P.k : 1)
        const isLeaning = isTorso || h > 0 // верх таза наклоняется вместе с корпусом
        return {
            a: lerp(table[i][1], table[i + 1][1], t),
            b: lerp(table[i][2], table[i + 1][2], t),
            cf: P.back + (isLeaning ? h * sinL : 0) - (isTorso ? 0 : 0.5),
            y: hipY - (isLeaning ? h * cosL : h),
        }
    }
    type Row = ReturnType<typeof rowAt>
    const sil = (r: Row) => ({cx: 32 + r.cf * sn, hw: Math.sqrt(r.a * r.a * cs * cs + r.b * r.b * sn * sn), y: r.y})
    const delta = Math.atan2(sn / 11, cs / 7.8) / D
    // Точка на поверхности корпуса по боковому смещению a: то, что ушло за край, прижимается к контуру
    const surf = (a: number, yArt: number): Pt => {
        const r = rowAt(TORSO, yArt, true)
        let al = Math.asin(cl(a / r.a, -1, 1)) / D
        const c = -delta
        while (al - c > 180) al -= 360
        while (al - c < -180) al += 360
        al = cl(al, c - 90, c + 90)
        return [32 + r.a * Math.sin(al * D) * cs + (r.cf + r.b * Math.cos(al * D)) * sn, r.y]
    }
    const surfPoly = (list: number[][]) => list.map((q) => surf(q[0], q[1]))
    const outline = (table: number[][], isTorso: boolean, bulge: number) => {
        const left: Pt[] = []
        const right: Pt[] = []
        for (const row of table) {
            const s = sil(rowAt(table, row[0], isTorso))
            left.push([s.cx - s.hw, s.y])
            right.push([s.cx + s.hw, s.y])
        }
        right.reverse()
        const lb = left[left.length - 1]
        const rb = right[0]
        const bottom = bulge ? ` Q ${n((lb[0] + rb[0]) / 2)} ${n(lb[1] + bulge)} ${xy(rb)}` : ` L ${xy(rb)}`
        return 'M ' + xy(left[0]) + curveThrough(left) + bottom + curveThrough(right) + ' Z'
    }
    const s0 = sil(rowAt(TORSO, 40.8, true))
    const s1 = sil(rowAt(TORSO, 42.2, true))
    const topY = (x: number) => lerp(s0.y, s1.y, cl((Math.abs(x - s1.cx) - s0.hw) / Math.max(0.01, s1.hw - s0.hw), 0, 1))

    // --- Руки
    const shoulderH = (HIP0 - 45.5) * P.k
    const armCalc = (spec: Arm, side: number, reach: Target | null) => {
        const shoulder: Vec = [side * 12.9, hipY - shoulderH * cosL, P.back + shoulderH * sinL - 0.3]
        let upperDir = dir(spec.sw, spec.sp, side)
        let elbow = add(shoulder, mul(upperDir, UPPER))
        let foreDir = dir(spec.sw + spec.el, spec.sp2, side)
        let wrist = add(elbow, mul(foreDir, FORE))
        let handDir = foreDir
        if (reach && P.reachMix > 0) {
            // Тянется к точке в плоскости «вперёд — вверх», локоть вниз
            const df = reach.f - shoulder[2]
            const dy = reach.y - shoulder[1]
            const dist = Math.min(Math.hypot(df, dy), UPPER + FORE - 0.05)
            const base = Math.atan2(df, dy)
            const bend = Math.acos(cl((UPPER * UPPER + dist * dist - FORE * FORE) / (2 * UPPER * dist), -1, 1))
            const m = P.reachMix
            const mix3 = (u: Vec, v: Vec): Vec => [lerp(u[0], v[0], m), lerp(u[1], v[1], m), lerp(u[2], v[2], m)]
            const target: Vec = [side * (Math.abs(shoulder[0]) - 1.5), shoulder[1] + Math.cos(base) * dist, shoulder[2] + Math.sin(base) * dist]
            elbow = mix3(elbow, add(shoulder, mul(dir((base - bend) / D, 3, side), UPPER)))
            wrist = mix3(wrist, target)
            upperDir = unit([elbow[0] - shoulder[0], elbow[1] - shoulder[1], elbow[2] - shoulder[2]])
            foreDir = unit([wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]])
            // Ладони плашмя на стенке ящика: пальцы вверх
            handDir = unit(mix3(foreDir, dir(172, 0, side)))
        }
        return {shoulder, elbow, wrist, upperDir, foreDir, handDir, side}
    }
    type ArmCalc = ReturnType<typeof armCalc>
    const arms = [armCalc(P.aL, 1, P.reach?.L ?? null), armCalc(P.aR, -1, P.reach?.R ?? null)]

    const drawArm = (g: ArmCalc) => {
        const s2 = pr(g.shoulder)
        const e2 = pr(g.elbow)
        const w2 = pr(g.wrist)
        const far = cl(-s2[2] / 9, 0, 1) // дальняя от нас рука темнее
        const pts = [s2, e2, w2]
        const ws = [6.2, 5.1, 4.4]
        F(limbPath(pts, ws, false), mix(C.skin, C.skinShade, far * 0.9))
        if (far < 0.4) F(limbShade(pts, ws), C.skinShade, 1 - far * 2)
        // Рукав футболки: до середины плеча, плечо скруглено
        const sleeveStart = pr(add(g.shoulder, mul(g.upperDir, 0.2)))
        const sleeveEnd = pr(add(g.shoulder, mul(g.upperDir, UPPER * 0.5)))
        const hemStart = pr(add(g.shoulder, mul(g.upperDir, UPPER * 0.42)))
        F(limbPath([sleeveStart, sleeveEnd], [7.2, 7.6], true), mix(C.shirt, C.shirtShade, far))
        const hem = segPts(hemStart, sleeveEnd, 7.7, 7.7, -0.5, 0.5)
        if (hem) F(poly(hem), mix(C.shirtShade, C.shirtDeep, far))
        // Перчатка: манжета, большой палец (смотрит вперёд и к телу), ладонь
        const palmBase = add(g.wrist, mul(g.handDir, 3))
        const thumbDir = unit(add(mul(g.handDir, 0.5), [-g.side * 0.6, 0, 0.75]))
        const glove = mix(C.glove, C.gloveShade, far)
        S(line([pr(add(g.wrist, mul(g.foreDir, -0.8))), pr(add(g.wrist, mul(g.foreDir, 2)))]), mix(C.gloveShade, C.gloveDeep, far), 6.3, 'butt')
        S(line([pr(palmBase), pr(add(palmBase, mul(thumbDir, 3.1)))]), glove, 2.5)
        S(line([pr(add(g.wrist, mul(g.handDir, 2.8))), pr(add(g.wrist, mul(g.handDir, 6.6)))]), glove, 5.6)
    }

    const drawLeg = (g: LegCalc) => {
        const h2 = pr(up(g.hip))
        const far = cl(-h2[2] / 4.5, 0, 1)
        const pts = [h2, pr(up(g.knee)), pr(up(g.ankle))]
        const ws = [10.4, 8.2, 7]
        F(limbPath(pts, ws, true), mix(C.pants, C.pantsShade, far))
        if (far < 0.5) F(limbShade(pts, ws), C.pantsShade, 1 - far * 2)
        const boot = mix(C.boot, C.bootShade, far)
        S(line([pr(up(add(g.ankle, mul(g.shin, -3.6)))), pr(up(add(g.ankle, mul(g.shin, 0.4))))]), boot, 8.4, 'butt')
        // Подошва — под ботинком; спереди она шире, сбоку длиннее
        const corners: Vec[] = []
        for (const q of [-1.2, 1.2]) {
            corners.push(pr(up(add(g.heelB, [q, 0, 0]))))
            corners.push(pr(up(add(g.toeB, [q, 0, 0]))))
        }
        corners.sort((u, v) => u[0] - v[0])
        const e0 = corners[0]
        const e1 = corners[3]
        const len = Math.hypot(e1[0] - e0[0], e1[1] - e0[1]) || 1
        const ux = (e1[0] - e0[0]) / len
        const uy = (e1[1] - e0[1]) / len
        const ext = 0.4 + 2.3 * Math.abs(cs)
        S(line([[e0[0] - ux * ext, e0[1] - uy * ext], [e1[0] + ux * ext, e1[1] + uy * ext]]), C.sole, 2.1, 'butt')
        const foot = [-1.2, 1.2].map((q) => line([pr(up(add(g.heelC, [q, 0, 0]))), pr(up(add(g.toeC, [q, 0, 0])))])).join(' ')
        S(foot, boot, 6.6)
    }

    // --- Порядок слоёв: дальние рука и нога, таз, ближние ноги, руки по бокам, корпус, голова, руки спереди
    const layer = (g: ArmCalc) => {
        const s2 = pr(g.shoulder)
        if (s2[2] < -3.5) return 'back'
        if (s2[2] > 3.5 || Math.max(pr(g.elbow)[2], pr(g.wrist)[2]) > 6.5) return 'front'
        return 'mid'
    }
    for (const g of arms) if (layer(g) === 'back') drawArm(g)
    const sorted = legs.slice().sort((u, v) => pr(u.hip)[2] - pr(v.hip)[2])
    for (const g of sorted) if (pr(g.hip)[2] < -1.5) drawLeg(g)
    F(outline(PELVIS, false, 2.4), C.pants)
    for (const g of sorted) if (pr(g.hip)[2] >= -1.5) drawLeg(g)
    for (const g of arms) if (layer(g) === 'mid') drawArm(g)

    // --- Шея и корпус
    const neckRow = rowAt(TORSO, 42, true)
    const headYaw = cl(P.yaw + P.headYaw, -90, 90)
    const hs = Math.sin(headYaw * D)
    const neck: Pt = [32 + (neckRow.cf - 0.4) * sn, neckRow.y]
    const hx = neck[0] + 0.8 * hs
    const hdy = neck[1] - 42
    S(line([[hx - 0.3 * hs, 33 + hdy], [neck[0], neck[1] + 1.4]]), C.skinShade, 6.8, 'butt')
    F(outline(TORSO, true, 0), C.vest)
    const strip: Pt[] = []
    for (const y of [47, 52, 60, 71.8]) {
        const s = sil(rowAt(TORSO, y, true))
        strip.push([s.cx + s.hw * 0.72, s.y])
    }
    for (const y of [71.8, 60, 52, 47]) {
        const s = sil(rowAt(TORSO, y, true))
        strip.push([s.cx + s.hw, s.y])
    }
    F(poly(strip), C.vestShade, 0.6)
    const band = (y0: number, y1: number, color: string) => {
        const a = sil(rowAt(TORSO, y0, true))
        const b = sil(rowAt(TORSO, y1, true))
        F(poly([[a.cx - a.hw, a.y], [a.cx + a.hw, a.y], [b.cx + b.hw, b.y], [b.cx - b.hw, b.y]]), color)
    }
    band(59.6, 62.6, C.reflect)
    band(61.8, 62.6, C.reflectShade)
    for (const sd of [-1, 1]) {
        const q = surfPoly([[sd * 6, 59.6], [sd * 8.6, 59.6], [sd * 8.6, 42.4], [sd * 6, 42.4]])
        if (Math.abs(q[0][0] - q[1][0]) < 0.35) continue
        F(poly([q[0], q[1], q[2], [q[2][0], topY(q[2][0])], [q[3][0], topY(q[3][0])], q[3]]), C.reflect)
    }
    const pocket = surfPoly([[-9.6, 64.6], [-4.4, 64.6], [-4.4, 68.8], [-9.6, 68.8]])
    if (Math.abs(pocket[0][0] - pocket[1][0]) > 0.4) F(poly(pocket), C.vestShade)
    const open = surfPoly([[-4.4, 41], [-3.9, 44], [-3.3, 47], [-2.2, 50], [-1.6, 71.9], [1.6, 71.9], [2.2, 50], [3.3, 47], [3.9, 44], [4.4, 41]])
    if (Math.abs(open[0][0] - open[9][0]) > 0.3) {
        F(poly(open), C.shirt)
        F(poly(surfPoly([[-1.5, 68.8], [1.5, 68.8], [1.5, 72.2], [-1.5, 72.2]])), C.buckle)
    }
    const collar = surfPoly([[-4.6, 40.6], [-3.4, 42.3], [-1.8, 43.1], [0, 43.35], [1.8, 43.1], [3.4, 42.3], [4.6, 40.6]])
    if (Math.abs(collar[0][0] - collar[6][0]) > 0.3) {
        F(poly(collar), C.skinShade)
        S(line(collar), C.shirtShade, 1.2)
    }

    // --- Голова: стоит прямо, в профиль может задирать подбородок (headPitch)
    const rot = -P.headPitch * hs * D
    const cr = Math.cos(rot)
    const sr = Math.sin(rot)
    for (const shape of headShapes(headYaw, P.expr, P.blink, P.helmet)) {
        shape.d = mapPath(shape.d, (x, y) => {
            const dx = x - 32
            const dy = y - 40
            return [hx + dx * cr - dy * sr, 40 + hdy + dx * sr + dy * cr]
        })
        out.push(shape)
    }
    for (const g of arms) if (layer(g) === 'front') drawArm(g)

    // --- Звёздочки над раздавленным
    const fx: Shape[] = []
    if (P.dizzy > 0) {
        for (let i = 0; i < 3; i++) {
            const a = P.time * 5 + i * 2.094
            const x = 32 + Math.cos(a) * 13
            const y = GROUND - 122 * P.sy - 9 + Math.sin(a) * 3.2
            const r = 2.6 + 0.5 * Math.sin(a)
            const star: Pt[] = []
            for (let j = 0; j < 10; j++) {
                const rr = j % 2 ? r * 0.45 : r
                const an = j * 36 * D - Math.PI / 2
                star.push([x + Math.cos(an) * rr, y + Math.sin(an) * rr])
            }
            fx.push({d: 'M ' + star.map(xy).join(' L ') + ' Z', f: C.star, o: Math.sin(a) > -0.2 ? P.dizzy : P.dizzy * 0.5})
        }
    }
    return {shapes: out, fx, sx: P.sx, sy: P.sy, cx: 32 + P.back * sn, shadowX: (pr(legs[0].ankle)[0] + pr(legs[1].ankle)[0]) / 2}
}

// ---------- Позы ----------
const arm = (sw: number, sp: number, el: number, sp2 = sp): Arm => ({sw, sp, el, sp2})
const leg = (sw: number, sp: number, kn: number, ft = 0, sp2 = sp * 0.35): Leg => ({sw, sp, kn, ft, sp2})

const pose = (part: Partial<Pose>): Pose => ({
    yaw: 0, headYaw: 0, headPitch: 0, lean: 0, k: 1, back: 0, air: 0, airMix: 0, sx: 1, sy: 1, dizzy: 0, time: 0,
    reachMix: 0, reach: null, aL: arm(0, 4, 6), aR: arm(0, 4, 6), lL: leg(0, 1.2, 1.5), lR: leg(0, 1.2, 1.5),
    expr: 'calm', blink: false, helmet: 3,
    ...part,
})

type Keys = [number, number][]
// Значение по ключевым точкам с плавным переходом; cyc — по кругу, key — от начала до конца
const key = (keys: Keys, x: number) => {
    if (x <= keys[0][0]) return keys[0][1]
    for (let i = 0; i < keys.length - 1; i++) {
        if (x <= keys[i + 1][0]) return lerp(keys[i][1], keys[i + 1][1], sstep(keys[i][0], keys[i + 1][0], x))
    }
    return keys[keys.length - 1][1]
}
const cyc = (keys: Keys, x: number) => key(keys, x - Math.floor(x))

const NUMERIC = ['yaw', 'headYaw', 'headPitch', 'lean', 'k', 'back', 'air', 'airMix', 'sx', 'sy', 'dizzy', 'time', 'reachMix'] as const

// Промежуточная поза между двумя
export const mixPose = (a: Pose, b: Pose, t: number): Pose => {
    if (t <= 0) return a
    if (t >= 1) return b
    const out: Pose = {...(t < 0.5 ? a : b)}
    for (const name of NUMERIC) out[name] = lerp(a[name], b[name], t)
    const mixArm = (u: Arm, v: Arm): Arm => ({sw: lerp(u.sw, v.sw, t), sp: lerp(u.sp, v.sp, t), el: lerp(u.el, v.el, t), sp2: lerp(u.sp2, v.sp2, t)})
    const mixLeg = (u: Leg, v: Leg): Leg => ({sw: lerp(u.sw, v.sw, t), sp: lerp(u.sp, v.sp, t), kn: lerp(u.kn, v.kn, t), ft: lerp(u.ft, v.ft, t), sp2: lerp(u.sp2, v.sp2, t)})
    out.aL = mixArm(a.aL, b.aL)
    out.aR = mixArm(a.aR, b.aR)
    out.lL = mixLeg(a.lL, b.lL)
    out.lR = mixLeg(a.lR, b.lR)
    out.reach = b.reach ?? a.reach
    return out
}

// Стоит: дышит и моргает
export const idlePose = (time: number): Pose => {
    const breath = Math.sin(time * 2.25)
    const a = arm(0.6 * breath, 4 + 0.5 * breath, 6)
    return pose({k: 1 + 0.007 * breath, blink: time % 3.3 > 3.2, aL: a, aR: a})
}

// Бег по клеткам: phase — фаза полного цикла (один шаг на клетку — полцикла)
const RUN_THIGH: Keys = [[0, 34], [0.16, 8], [0.34, -24], [0.46, -20], [0.62, 16], [0.8, 44], [1, 34]]
const RUN_KNEE: Keys = [[0, 16], [0.1, 26], [0.24, 14], [0.34, 20], [0.5, 84], [0.64, 100], [0.8, 64], [0.93, 22], [1, 16]]
const RUN_FOOT: Keys = [[0, -8], [0.08, 0], [0.24, 6], [0.34, 34], [0.5, 48], [0.7, 22], [0.9, -12], [1, -8]]

export const runPose = (phase: number, facing: number): Pose => {
    const runLeg = (p: number) => leg(cyc(RUN_THIGH, p), 1, cyc(RUN_KNEE, p), cyc(RUN_FOOT, p), 0.4)
    const runArm = (p: number) => {
        const c = Math.cos(p * Math.PI * 2)
        return arm(2 - 30 * c, 5, 76 - 12 * c)
    }
    // Правая нога в фазе phase, левая — в противофазе; руки навстречу ногам
    return pose({
        yaw: 90 * facing, headPitch: 2, lean: 9, back: -1,
        lR: runLeg(phase), lL: runLeg(phase + 0.5), aR: runArm(phase), aL: runArm(phase + 0.5),
    })
}

// Толкает ящик: стенка ящика — на краю клетки, ладони упираются в неё
const PUSH_THIGH: Keys = [[0, 44], [0.3, 4], [0.5, -30], [0.6, -26], [0.82, 38], [1, 44]]
const PUSH_KNEE: Keys = [[0, 62], [0.25, 30], [0.5, 8], [0.62, 52], [0.82, 90], [1, 62]]
const PUSH_FOOT: Keys = [[0, 12], [0.3, 16], [0.5, 40], [0.66, 30], [0.86, 4], [1, 12]]

export const pushPose = (phase: number, facing: number): Pose => {
    const pushLeg = (p: number) => leg(cyc(PUSH_THIGH, p), 1, cyc(PUSH_KNEE, p), cyc(PUSH_FOOT, p), 0.4)
    return pose({
        yaw: 90 * facing, headPitch: 16, lean: 33, back: -15.5, expr: 'focus',
        lR: pushLeg(phase), lL: pushLeg(phase + 0.5), aR: arm(40, 3, 40), aL: arm(40, 3, 40),
        reach: {R: {f: 28.4, y: 86}, L: {f: 28.4, y: 82}}, reachMix: 1,
    })
}

// Прыжок на месте: v — доля прыжка 0…1. Толчок с кулаками у груди, вверху поджал ноги, на спуске руки вверх
export const jumpPose = (v: number): Pose => {
    const sp = key([[0, 12], [0.1, 2], [0.3, 3], [0.5, 15], [0.9, 5], [1, 10]], v)
    const l = leg(
        key([[0, 42], [0.1, 0], [0.3, 0], [0.5, 56], [0.7, 30], [0.9, 8], [1, 26]], v), sp,
        key([[0, 84], [0.1, 3], [0.3, 6], [0.5, 104], [0.7, 58], [0.9, 16], [1, 52]], v),
        key([[0, 0], [0.1, 44], [0.35, 40], [0.55, 24], [0.9, 16], [1, 0]], v), -sp * 0.6,
    )
    const a = arm(
        key([[0, -30], [0.1, 40], [0.3, 56], [0.5, 36], [0.75, 20], [1, 8]], v),
        key([[0, 10], [0.1, 20], [0.3, 24], [0.5, 40], [0.75, 62], [1, 34]], v),
        key([[0, 34], [0.1, 96], [0.3, 104], [0.5, 100], [0.75, 140], [1, 50]], v),
        key([[0, 10], [0.3, 12], [0.5, 12], [0.75, 14], [1, 26]], v),
    )
    return pose({
        k: key([[0, 0.95], [0.1, 1.05], [0.3, 1.04], [0.5, 1], [0.8, 1.02], [1, 0.97]], v),
        air: key([[0, 0], [0.5, -2], [1, 0]], v), airMix: key([[0, 0], [0.07, 1], [0.94, 1], [1, 0]], v),
        lL: l, lR: l, aL: a, aR: a, expr: v < 0.34 ? 'focus' : 'wow',
    })
}

// Запрыгивает вбок на ящик: h — доля перелёта 0…1
export const hopPose = (h: number, facing: number): Pose => pose({
    yaw: 90 * facing, headPitch: 4, lean: 12, k: 1.01, back: -1, expr: 'focus',
    air: -3, airMix: key([[0, 1], [0.85, 1], [1, 0]], h),
    lR: leg(key([[0, 60], [0.6, 52], [1, 30]], h), 1, key([[0, 96], [0.6, 78], [1, 40]], h), key([[0, 14], [1, -4]], h), 0.4),
    lL: leg(key([[0, -24], [0.6, -6], [1, 6]], h), 1, key([[0, 58], [0.6, 74], [1, 46]], h), key([[0, 44], [1, 20]], h), 0.4),
    aR: arm(key([[0, -44], [1, -20]], h), 6, 70), aL: arm(key([[0, 50], [1, 28]], h), 6, 84),
})

// Падает: руки вверх, ноги болтаются
export const fallPose = (time: number): Pose => {
    const wave = Math.sin(time * 30) * 4
    return pose({
        k: 1.03, air: -2, airMix: 1, expr: 'wow',
        aL: arm(16, 80 + wave, 150, 12), aR: arm(16, 80 - wave, 150, 12), lL: leg(10, 5, 26, 30, 0), lR: leg(4, 5, 18, 34, 0),
    })
}

// Приземлился: q — 0…1, от удара о пол до обычной позы base
export const landPose = (q: number, base: Pose): Pose => {
    const squat = pose({
        yaw: base.yaw, headYaw: base.headYaw, lean: 3, k: 0.93, helmet: base.helmet,
        aL: arm(14, 24, 44), aR: arm(14, 24, 44), lL: leg(54, 14, 104, 0, -9), lR: leg(54, 14, 104, 0, -9),
    })
    return mixPose(base, squat, 1 - sstep(0, 1, q))
}

// Раздавило: t — секунд с момента удара
export const crushedPose = (t: number): Pose => {
    const q = sstep(0, 0.09, t)
    const bounce = 1 + 0.06 * Math.sin(t * 9) * Math.exp(-t * 3)
    const a = arm(0, lerp(4, 24, q), 30)
    const l = leg(0, lerp(1, 13, q), 2, 0, 12)
    return pose({
        expr: 'hurt', aL: a, aR: a, lL: l, lR: l,
        sx: lerp(1, 1.3, q) * (2 - bounce), sy: lerp(1, 0.3, q) * bounce, dizzy: sstep(0.1, 0.3, t), time: t,
    })
}
