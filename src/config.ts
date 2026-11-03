// ---------- Мир в клетках ----------
export const COLS = 9
export const ROWS = 12
export const CELL = 32 // пикселей на клетку во внутреннем холсте
export const TOP = 48 // зона рельса с краном
export const W = COLS * CELL
export const H = TOP + ROWS * CELL

// ---------- Грузчик ----------
// Ходит строго по клеткам; время — на один шаг анимации
export const MOVE_T = 0.22
export const JUMP_T = 0.46 // прыжок — плавная дуга вверх и вниз, без зависания
export const JUMP_H = 1.1 // высота прыжка в клетках: хватает, чтобы встать на один ящик
export const STEP_PART = 2 / 3 // шагнуть вбок в прыжке можно, только поднявшись выше 2/3
export const BREAK_PART = 1 / 4 // голова разбивает ящик только в первую четверть прыжка
export const FALL_T = 0.08
export const JUMP_BUFFER = 0.15 // нажатие прыжка помнится столько секунд
export const LIVES = 3
export const HELMET_HITS = 3 // ударов головой на одну жизнь

// ---------- Ящики ----------
export const BOX_FALL = 6.5 // клеток в секунду
export const CLEAR_TIME = 0.35

// ---------- Палитра ЖК-экрана с оранжевой подсветкой ----------
export const COLORS = {
    lcd: '#f0a65c',
    dark: '#3b1d0b',
    mid: '#a25b26',
    light: '#f7c68e',
}

export const FONT = '"Press Start 2P", monospace'
