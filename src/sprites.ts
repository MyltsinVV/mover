import {HELMET_HITS} from './config.ts'

// Пиксельные спрайты строками: X — тёмная точка, o — светлая, . — пусто

// Грузчик в каске: 16×32 точек по 2 пикселя
export const HEAD = {
    center: [
        '.....XXXXXX.....', '....XoXooXoX....', '...XooXooXooX...', '...XooXooXooX...',
        '..XXXXXXXXXXXX..', '....XooooooX....', '....XoXooXoX....', '....XooooooX....',
        '....XooXXooX....', '.....XooooX.....', '......XXXX......', '.......XX.......',
    ],
    left: [
        '.....XXXXXX.....', '....XoXooXoX....', '...XooXooXooX...', '...XooXooXooX...',
        '..XXXXXXXXXXXX..', '....XooooooX....', '....XXooXooX....', '....XooooooX....',
        '....XoXXoooX....', '.....XooooX.....', '......XXXX......', '.......XX.......',
    ],
    right: [
        '.....XXXXXX.....', '....XoXooXoX....', '...XooXooXooX...', '...XooXooXooX...',
        '..XXXXXXXXXXXX..', '....XooooooX....', '....XooXooXX....', '....XooooooX....',
        '....XoooXXoX....', '.....XooooX.....', '......XXXX......', '.......XX.......',
    ],
}

// Каска трескается после каждого удара головой: целая → трещина → две трещины → нет каски.
// Индекс — сколько ударов каска ещё выдержит
const HELMET_TOPS = [
    ['................', '................', '.....XXXXXX.....', '....XXXXXXXX....', '....XoXXoXXX....'],
    ['.....XXXXXX.....', '....XXXXoXoX....', '...XoXXoXXXoX...', '...XXoXXoXoXX...', '..XXXXXXXXXXXX..'],
    ['.....XXXXXX.....', '....XoXXoXoX....', '...XooXoXXooX...', '...XooXXoXooX...', '..XXXXXXXXXXXX..'],
]

export const headWithHelmet = (rows: string[], hitsLeft: number) =>
    hitsLeft >= HELMET_HITS ? rows : [...HELMET_TOPS[hitsLeft], ...rows.slice(5)]

export const BODY = [
    '...XXXXXXXXXX...', '..XXooXXXXooXX..', '..XoooXooXoooX..', '..XoooXooXoooX..',
    '..XooXXXXXXooX..', '..XoXXooooXXoX..', '..XoXooooooXoX..', '..XoXooooooXoX..',
    '..XXXooooooXXX..', '..XX.XXXXXX.XX..', '.....XooooX.....', '.....XooooX.....',
]

export const LEGS = {
    stand: [
        '.....XoXXoX.....', '.....XoXXoX.....', '.....XoXXoX.....', '.....XoXXoX.....',
        '.....XoXXoX.....', '.....XXXXXX.....', '....XXXXXXXX....', '....XXXXXXXX....',
    ],
    walk: [
        '....XoX..XoX....', '....XoX..XoX....', '...XoX....XoX...', '...XoX....XoX...',
        '..XoX......XoX..', '..XXX......XXX..', '.XXXX......XXXX.', '.XXXX......XXXX.',
    ],
    jump: [
        '....XooooooX....', '...XoXXXXXXoX...', '..XoX......XoX..', '..XoX......XoX..',
        '..XXX......XXX..', '.XXXX......XXXX.', '................', '................',
    ],
}

export const MAN_FLAT = [
    ...Array<string>(24).fill('................'),
    '......XXXX......', '...XXooooooXX...', '.XXXXXXXXXXXXXX.', '..XoXooooooXoX..',
    'XXXXXXXXXXXXXXXX', 'XooXoooooooXoooX', 'XooXoooooooXoooX', 'XXXXXXXXXXXXXXXX',
]

// Ящики ведут себя одинаково, но выглядят по-разному: 8×8 точек по 4 пикселя
export const LOOKS = [
    ['XXXXXXXX', 'X......X', 'X.X..X.X', 'X..XX..X', 'X..XX..X', 'X.X..X.X', 'X......X', 'XXXXXXXX'],
    ['XXXXXXXX', 'X......X', 'X.XXXX.X', 'X.X..X.X', 'X.X..X.X', 'X.XXXX.X', 'X......X', 'XXXXXXXX'],
    ['XXXXXXXX', 'X......X', 'X..XX..X', 'X.X..X.X', 'X.X..X.X', 'X..XX..X', 'X......X', 'XXXXXXXX'],
    ['XXXXXXXX', 'XX.XX.XX', 'X......X', 'XX.XX.XX', 'XX.XX.XX', 'X......X', 'XX.XX.XX', 'XXXXXXXX'],
    ['XXXXXXXX', 'X.X.X.XX', 'XX.X.X.X', 'X.X.X.XX', 'XX.X.X.X', 'X.X.X.XX', 'XX.X.X.X', 'XXXXXXXX'],
    ['XXXXXXXX', 'X......X', 'XXXXXXXX', 'X......X', 'XXXXXXXX', 'X......X', 'XXXXXXXX', 'XXXXXXXX'],
]

export const randomLook = () => Math.floor(Math.random() * LOOKS.length)
