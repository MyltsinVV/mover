// ---------- Мир в клетках ----------
export const COLS = 9
export const ROWS = 12
export const CELL = 32 // пикселей на клетку во внутреннем холсте
export const TOP = 48 // зона рельса с краном
export const W = COLS * CELL
export const FLOOR = 8 // полоса пола под нижним рядом
export const H = TOP + ROWS * CELL + FLOOR

// ---------- Грузчик ----------
// Ходит строго по клеткам; время — на один шаг анимации
export const MOVE_T = 0.22
export const JUMP_T = 0.46 // прыжок — плавная дуга вверх и вниз, без зависания
export const JUMP_H = 1.1 // высота прыжка в клетках: хватает, чтобы встать на один ящик
export const STEP_PART = 2 / 3 // шагнуть вбок в прыжке можно, только поднявшись выше 2/3
export const BREAK_PART = 1 / 4 // голова разбивает ящик только в первую четверть прыжка
export const FALL_T = 0.08
export const JUMP_BUFFER = 0.15 // нажатие прыжка помнится столько секунд
export const CRUSH_T = 1.4 // столько секунд грузчик лежит раздавленным
export const LAND_T = 0.17 // присед после приземления
export const LIVES = 3
export const HELMET_HITS = 3 // ударов головой на одну жизнь

// ---------- Ящики ----------
export const BOX_FALL = 6.5 // клеток в секунду

// ---------- Мягкий старт ----------
// Первые WARMUP секунд кранов меньше и ездят они реже, к концу разминки темп выходит на обычный
export const WARMUP = 60
export const WARMUP_ONE_CRANE = 25 // столько секунд в начале кран только один
export const WARMUP_EXTRA_DELAY = 1.2 // на столько секунд реже выезжают краны в самом начале
export const CLEAR_TIME = 0.35

// ---------- Цвета склада ----------
export const COLORS = {
    wallTop: '#f6e7cf',
    wallBottom: '#ead2ac',
    sky: '#cfeaff',
    frame: '#5b6b7d',
    shelf: '#6b87a8',
    shelfBoxA: '#d8a46a',
    shelfBoxB: '#c79a6a',
    beam: '#3b4654',
    ceiling: '#4b5866',
    bulb: '#fff3c4',
    floor: '#8b6f57',
    crane: '#ffc531',
    craneShade: '#e5a50f',
    stripeA: '#ffc531',
    stripeB: '#2b2b2e',
    dust: '#8b6f57',
    text: '#2b2433',
    textLight: '#ffffff',
}

export const FONT = 'Rubik, system-ui, sans-serif'
