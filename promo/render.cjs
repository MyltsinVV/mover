// Рисует обложки в стиле игры: ЖК-экран, склад, кран, грузчик бьёт ящик головой.
// Запуск из корня проекта: node promo/render.cjs — картинки на двух языках появятся в promo/
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const SPR = JSON.parse(fs.readFileSync(path.join(dir, 'sprites.json'), 'utf8'));
const FONT = fs.readFileSync(path.join(dir, '../public/fonts/PressStart2P-Regular.ttf')).toString('base64');

const LAYOUTS = {
  // Иконки для каталогов GamePush: 1024×1024 и 4:3 512×384, без скруглений
  icon: {
    file: 'icon', W: 1024, H: 1024, cell: 128,
    heights: [2, 1, 0, 0, 1, 2, 1, 2],
    worker: { col: 3, lift: 0.45 }, look: [0, 3, 1, 5, 2, 4],
    falling: [{ col: 1, y: 2.9, look: 2 }],
    cranes: [{ x: 1.1, carrying: false }, { x: 6.4, carrying: false }],
    title: { x: 512, y: 275, size: 108, sub: 36, align: 'center' },
  },
  // Маленькая — без подзаголовка и «BONK!»: на мелкой плитке их всё равно не прочесть
  icon43: {
    file: 'icon', W: 512, H: 384, cell: 64,
    heights: [1, 1, 0, 1, 2, 0, 1, 2],
    worker: { col: 5, lift: 0.45 }, look: [0, 3, 1, 5, 2, 4],
    falling: [{ col: 1, y: 2.7, look: 2 }],
    cranes: [],
    title: { x: 256, y: 112, size: 54, sub: 0, align: 'center' },
    noBonk: true,
  },
  square: {
    W: 800, H: 800, cell: 100,
    heights: [2, 1, 0, 0, 1, 2, 1, 2],
    worker: { col: 3, lift: 0.45 }, look: [0, 3, 1, 5, 2, 4],
    falling: [{ col: 1, y: 2.9, look: 2 }],
    cranes: [{ x: 1.1, carrying: false }, { x: 6.4, carrying: false }],
    title: { x: 400, y: 215, size: 84, sub: 28, align: 'center' },
  },
  portrait: {
    W: 1080, H: 1920, cell: 180,
    heights: [2, 1, 0, 1, 2, 3],
    worker: { col: 2, lift: 0.45 }, look: [1, 0, 3, 2, 5, 4],
    falling: [{ col: 4, y: 4.4, look: 0 }, { col: 0, y: 4.9, look: 5 }],
    cranes: [{ x: 4.2, carrying: false }, { x: 0.3, carrying: false }, { x: 2.6, carrying: true, look: 3 }],
    title: { x: 540, y: 640, size: 120, sub: 40, align: 'center' },
  },
  landscape: {
    W: 1920, H: 1080, cell: 120,
    heights: [2, 1, 2, 1, 2, 1, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2],
    worker: { col: 11, lift: 0.45 }, look: [2, 1, 4, 0, 3, 5],
    falling: [{ col: 14, y: 5.2, look: 1 }],
    cranes: [{ x: 14.2, carrying: false }, { x: 12.6, carrying: true, look: 0 }],
    title: { x: 110, y: 360, size: 140, sub: 44, align: 'left' },
  },
};

// Надписи на обложке для каждого языка
const TEXTS = {
  en: { title: 'SIDE GIG', sub: 'WAREHOUSE SHIFT', bonk: 'BONK!', subScale: 1 },
  // Русский подзаголовок длиннее — чуть мельче, чтобы не налезал на летящие ящики
  ru: { title: 'ХАЛТУРКА', sub: 'ПОДРАБОТКА ГРУЗЧИКОМ', bonk: 'БАЦ!', subScale: 0.82 },
};

const page = (layout, words) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'PS2P'; src: url(data:font/ttf;base64,${FONT}); }
html, body { margin: 0; background: #000; }
canvas { display: block; }
</style></head><body><canvas id="c"></canvas><script>(() => {
const S = ${JSON.stringify(SPR)};
const L = ${JSON.stringify(layout)};
const W = ${JSON.stringify(words)};
const C = { lcd: '#f0a65c', dark: '#3b1d0b', mid: '#a25b26', light: '#f7c68e', case: '#2b3226' };
document.fonts.load('40px PS2P').then(() => {
  const cv = document.getElementById('c');
  cv.width = L.W; cv.height = L.H;
  const ctx = cv.getContext('2d');
  const cell = L.cell, px = cell / 8;
  const cols = L.heights.length;
  const ox = Math.round((L.W - cols * cell) / 2);   // склад по центру
  const ground = L.H;

  const sprite = (rows, x, y, scale, color = C.dark) => {
    rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      ctx.fillStyle = ch === 'o' ? C.light : color;
      ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), Math.ceil(scale), Math.ceil(scale));
    }));
  };
  const crate = (look, x, y) => {
    ctx.fillStyle = C.light;
    ctx.fillRect(x + px, y + px, cell - 2 * px, cell - 2 * px);
    sprite(S.looks[look], x, y, px);
  };
  const colX = (c) => ox + c * cell;
  const rowY = (r) => ground - (r + 1) * cell;   // верх ящика в ряду r

  // Экран с подсветкой и лёгкой ЖК-сеткой
  ctx.fillStyle = C.lcd;
  ctx.fillRect(0, 0, L.W, L.H);
  const g = ctx.createRadialGradient(L.W / 2, L.H * 0.4, Math.min(L.W, L.H) * 0.2, L.W / 2, L.H / 2, Math.max(L.W, L.H) * 0.75);
  g.addColorStop(0, 'rgba(255,214,150,0.35)');
  g.addColorStop(1, 'rgba(120,50,10,0.35)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, L.W, L.H);
  ctx.fillStyle = 'rgba(59,29,11,0.05)';
  for (let x = 0; x < L.W; x += px) ctx.fillRect(x, 0, 1, L.H);
  for (let y = 0; y < L.H; y += px) ctx.fillRect(0, y, L.W, 1);

  // Потолок с растровой штриховкой и рельс крана
  const top = px * 2;
  ctx.fillStyle = C.mid;
  for (let y = 0; y < top; y += px) for (let x = (y / px) % 2 * px; x < L.W; x += px * 2) ctx.fillRect(x, y, px, px);
  ctx.fillStyle = C.dark;
  ctx.fillRect(0, top, L.W, px);
  ctx.fillStyle = C.mid;
  for (let x = 0; x < L.W; x += px * 4) ctx.fillRect(x, top + px, px, px);

  // Краны: тележка на рельсе, трос, иногда ящик
  for (const cr of L.cranes) {
    const x = ox + cr.x * cell;
    ctx.fillStyle = C.dark;
    ctx.fillRect(x + px, px, cell - 2 * px, px * 3);
    ctx.fillRect(x + cell / 2 - px / 2, px * 4, px, px * 2.5);
    if (cr.carrying) crate(cr.look, x, px * 6.5);
  }

  // Стопки ящиков
  L.heights.forEach((h, c) => {
    for (let r = 0; r < h; r++) crate(L.look[(c * 3 + r * 5) % L.look.length], colX(c), rowY(r));
  });

  // Падающие ящики с чёрточками движения
  for (const f of L.falling) {
    const x = colX(f.col), y = ground - (f.y + 1) * cell;
    ctx.fillStyle = 'rgba(59,29,11,0.35)';
    for (let i = 1; i <= 3; i++) ctx.fillRect(x + px * (1 + i * 1.5), y - px * (2 + i * 1.6), px, px * 1.2);
    crate(f.look, x, y);
  }

  // Грузчик в прыжке и ящик, разбитый о каску
  const w = L.worker;
  const base = L.heights[w.col];
  const manScale = cell / 16;
  const feetY = ground - (base + w.lift) * cell;
  const headTop = feetY - 2 * cell;
  const man = [...S.headC, ...S.body, ...S.legsJump];
  sprite(man, colX(w.col), headTop, manScale);

  // Ящик раскалывается о каску: две половинки разлетаются, вокруг — искры удара
  const cx = colX(w.col) + cell / 2, cy = headTop;
  const half = (cols, dx, angle) => {
    ctx.save();
    ctx.translate(cx + dx, cy - cell * 0.62);
    ctx.rotate(angle);
    const rows = S.looks[1].map((row) => row.slice(cols[0], cols[1]));
    ctx.fillStyle = C.light;
    ctx.fillRect(-cell / 4 + (cols[0] === 0 ? px : 0), -cell / 2 + px, cell / 2 - px, cell - 2 * px);
    sprite(rows, -cell / 4, -cell / 2, px);
    ctx.restore();
  };
  half([0, 4], -cell * 0.5, -0.5);
  half([4, 8], cell * 0.5, 0.5);
  // Искры: короткие лучи от точки удара
  ctx.fillStyle = C.dark;
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    for (let k = 0; k < 2; k++) {
      const r = cell * (0.55 + k * 0.18);
      ctx.fillRect(Math.round(cx + Math.cos(a) * r * 1.25 - px / 2), Math.round(cy - px + Math.sin(a) * r * 0.9 - px / 2), px, px);
    }
  }
  const bits = [[-1.1, -1.5], [1.2, -1.6], [-0.4, -2.0], [0.5, -2.2], [-1.6, -0.6], [1.7, -0.7]];
  bits.forEach(([dx, dy]) => ctx.fillRect(Math.round(cx + dx * cell), Math.round(cy + dy * cell * 0.7), px * 1.2, px * 1.2));

  // «BONK!» над местом удара
  if (!L.noBonk) {
  ctx.font = Math.round(px * 3.2) + 'px PS2P';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const bx = cx, by = cy - cell * 1.55;
  ctx.fillStyle = C.light;
  ctx.fillText(W.bonk, bx + px * 0.6, by + px * 0.6);
  ctx.fillStyle = C.dark;
  ctx.fillText(W.bonk, bx, by);
  }

  // Название: тёмные буквы со светлой тенью, как на подсвеченном экране
  const t = L.title;
  const text = (str, size, x, y) => {
    ctx.font = size + 'px PS2P';
    ctx.textAlign = t.align;
    const sh = Math.max(4, Math.round(size / 12));
    ctx.fillStyle = C.light;
    ctx.fillText(str, x + sh, y + sh);
    ctx.fillStyle = C.mid;
    ctx.fillText(str, x + sh / 2, y + sh / 2);
    ctx.fillStyle = C.dark;
    ctx.fillText(str, x, y);
  };
  text(W.title, t.size, t.x, t.y);
  const sub = Math.round(t.sub * W.subScale);
  ctx.font = sub + 'px PS2P';
  ctx.textAlign = t.align;
  ctx.fillStyle = C.dark;
  if (sub > 0) ctx.fillText(W.sub, t.x + (t.align === 'left' ? 6 : 0), t.y + t.sub * 2.4);

  document.title = 'done';
});
})();</script></body></html>`;

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  for (const [lang, words] of Object.entries(TEXTS)) {
    for (const [name, layout] of Object.entries(LAYOUTS)) {
      await p.setViewportSize({ width: layout.W, height: layout.H });
      await p.setContent(page(layout, words));
      await p.waitForFunction(() => document.title === 'done');
      const out = path.join(dir, `${layout.file ?? 'cover_' + name}_${layout.W}x${layout.H}_${lang}.png`);
      await (await p.$('#c')).screenshot({ path: out });
      console.log(out);
    }
  }
  await b.close();
})();
