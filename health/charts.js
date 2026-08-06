// Grafice cu bare, desenate pe canvas. Fără biblioteci externe.

function setup(canvas) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight || 160;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Grafic cu bare.
 * @param canvas element
 * @param values număr[]
 * @param labels string[]
 * @param opts { color, goal, format, unit }
 */
export function barChart(canvas, values, labels, opts = {}) {
  const { ctx, w, h } = setup(canvas);
  const color = opts.color || '#5b8cff';
  const fmt = opts.format || ((v) => String(Math.round(v)));
  const max = Math.max(opts.goal || 0, ...values, 1);
  const padB = 22;
  const padT = 18;
  const n = values.length;
  const gap = 10;
  const bw = (w - gap * (n - 1)) / n;
  const chartH = h - padB - padT;

  // linie obiectiv
  if (opts.goal) {
    const gy = padT + chartH - (opts.goal / max) * chartH;
    ctx.strokeStyle = 'rgba(56,224,200,.5)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // când sunt multe bare, arătăm eticheta doar din X în X
  const labelEvery = opts.labelEvery || 1;

  values.forEach((v, i) => {
    const x = i * (bw + gap);
    const bh = Math.max(2, (v / max) * chartH);
    const y = padT + chartH - bh;
    const isLast = i === n - 1;

    const grad = ctx.createLinearGradient(0, y, 0, y + bh);
    grad.addColorStop(0, color);
    grad.addColorStop(1, isLast ? color : color + '99');
    ctx.fillStyle = v === 0 ? 'rgba(255,255,255,.08)' : grad;
    roundRect(ctx, x, y, bw, Math.max(2, bh), Math.min(6, bw / 2));
    ctx.fill();

    // valoare deasupra barei celei mai recente
    if (isLast && v > 0) {
      ctx.fillStyle = '#eef1ff';
      ctx.font = '600 11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(fmt(v), x + bw / 2, y - 5);
    }

    // etichetă (rărită la grafice dese)
    const showLabel = isLast || i % labelEvery === 0;
    if (showLabel && labels[i] != null) {
      ctx.fillStyle = isLast ? '#eef1ff' : '#9aa6d4';
      ctx.font = '11px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + bw / 2, h - 6);
    }
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
