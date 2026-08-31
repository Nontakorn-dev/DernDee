export class ChromaBlit {
  private buf: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  constructor() {
    this.buf = document.createElement("canvas");
    this.buf.width = 720;
    this.buf.height = 720;
    const ctx = this.buf.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("chroma canvas");
    this.ctx = ctx;
  }

  draw(
    dest: CanvasRenderingContext2D,
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    const size = Math.min(944, Math.max(560, Math.round(Math.max(dw, dh) * 2)));
    if (this.buf.width !== size) {
      this.buf.width = size;
      this.buf.height = size;
    }
    const { ctx, buf } = this;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const hot = r - g;
      const pink = b - g;
      const hard = r > 158 && g < 50 && hot > 115 && pink > 28;
      if (hard) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
        continue;
      }
      const fringe = r > 148 && g < 108 && hot > 52 && pink > 6;
      if (!fringe) continue;
      const tg = Math.min(1, Math.max(0, (92 - g) / 58));
      const tp = Math.min(1, Math.max(0, pink / 85));
      const t = tg * Math.max(tp, 0.35);
      if (t < 0.12) continue;
      const nextA = Math.round(d[i + 3] * (1 - t * 0.94));
      const mag = Math.max(0, Math.min(r, b) - g);
      d[i] = Math.max(0, r - mag * t * 0.7);
      d[i + 1] = Math.min(255, g + mag * t * 0.22);
      d[i + 2] = Math.max(0, b - mag * t * 0.55);
      if (nextA < 18) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
      } else {
        d[i + 3] = nextA;
      }
    }

    const w = size;
    for (let y = 1; y < size - 1; y += 1) {
      for (let x = 1; x < size - 1; x += 1) {
        const i = (y * w + x) * 4;
        if (d[i + 3] === 0) continue;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        if (!(r > 140 && g < 110 && b > g)) continue;
        let empty = 0;
        if (d[((y - 1) * w + x) * 4 + 3] === 0) empty += 1;
        if (d[((y + 1) * w + x) * 4 + 3] === 0) empty += 1;
        if (d[(y * w + x - 1) * 4 + 3] === 0) empty += 1;
        if (d[(y * w + x + 1) * 4 + 3] === 0) empty += 1;
        if (empty >= 2) {
          d[i] = 0;
          d[i + 1] = 0;
          d[i + 2] = 0;
          d[i + 3] = 0;
        }
      }
    }

    ctx.putImageData(img, 0, 0);
    dest.imageSmoothingEnabled = true;
    dest.imageSmoothingQuality = "high";
    dest.drawImage(buf, dx, dy, dw, dh);
  }
}
