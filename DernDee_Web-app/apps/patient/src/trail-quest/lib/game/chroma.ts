import { isConstrainedWebKit } from "@trail/lib/game/runtime";

const VERT = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform float u_packed;
void main() {
  vec4 full = texture2D(u_image, v_uv);
  vec3 packedColor = texture2D(u_image, vec2(v_uv.x * 0.5, v_uv.y)).rgb;
  float packedAlpha = texture2D(u_image, vec2(0.5 + v_uv.x * 0.5, v_uv.y)).r;
  if (u_packed > 0.5) {
    gl_FragColor = vec4(packedColor, packedAlpha);
    return;
  }
  vec4 c = full;
  float r = c.r * 255.0;
  float g = c.g * 255.0;
  float b = c.b * 255.0;
  float hot = r - g;
  float pink = b - g;
  if (r > 158.0 && g < 50.0 && hot > 115.0 && pink > 28.0) {
    gl_FragColor = vec4(0.0);
    return;
  }
  if (r > 148.0 && g < 108.0 && hot > 52.0 && pink > 6.0) {
    float tg = clamp((92.0 - g) / 58.0, 0.0, 1.0);
    float tp = clamp(pink / 85.0, 0.0, 1.0);
    float t = tg * max(tp, 0.35);
    if (t >= 0.12) {
      float nextA = c.a * (1.0 - t * 0.94);
      float mag = max(0.0, min(r, b) - g);
      c.r = max(0.0, r - mag * t * 0.7) / 255.0;
      c.g = min(255.0, g + mag * t * 0.22) / 255.0;
      c.b = max(0.0, b - mag * t * 0.55) / 255.0;
      if (nextA < 0.07) {
        gl_FragColor = vec4(0.0);
        return;
      }
      c.a = nextA;
    }
  }
  gl_FragColor = c;
}
`;

type GlBlit = {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  tex: WebGLTexture;
  size: number;
  draw: (source: TexImageSource, packed: boolean) => boolean;
  dispose: () => void;
};

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createGlBlit(): GlBlit | null {
  const canvas = document.createElement("canvas");
  const size = isConstrainedWebKit() ? 640 : 720;
  canvas.width = size;
  canvas.height = size;
  const gl = canvas.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: true,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const aPos = gl.getAttribLocation(program, "a_pos");
  const aUv = gl.getAttribLocation(program, "a_uv");
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(aUv);
  gl.vertexAttribPointer(aUv, 2, gl.FLOAT, false, 16, 8);
  gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
  const uPacked = gl.getUniformLocation(program, "u_packed");

  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.viewport(0, 0, size, size);
  gl.clearColor(0, 0, 0, 0);
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  let alive = true;
  canvas.addEventListener(
    "webglcontextlost",
    (event) => {
      event.preventDefault();
      alive = false;
    },
    false,
  );

  return {
    canvas,
    gl,
    tex,
    size,
    draw(source, packed) {
      if (!alive || gl.isContextLost()) return false;
      try {
        gl.uniform1f(uPacked, packed ? 1 : 0);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.viewport(0, 0, size, size);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      } catch {
        return false;
      }
    },
    dispose() {
      alive = false;
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}

export function isPackedSource(source: CanvasImageSource) {
  if (source instanceof HTMLVideoElement) {
    return source.videoWidth >= source.videoHeight * 1.55;
  }
  if (source instanceof HTMLImageElement) {
    return source.naturalWidth >= source.naturalHeight * 1.55;
  }
  return false;
}

function sourceReady(source: CanvasImageSource) {
  if (source instanceof HTMLVideoElement) {
    return source.readyState >= 2 && source.videoWidth > 0 && !source.seeking;
  }
  if (source instanceof HTMLImageElement) {
    return source.naturalWidth > 0;
  }
  return true;
}

export class ChromaBlit {
  private gl: GlBlit | null;
  private buf: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cpuSize: number;
  private smooth: ImageSmoothingQuality;

  constructor() {
    this.gl = createGlBlit();
    this.buf = document.createElement("canvas");
    this.cpuSize = isConstrainedWebKit() ? 480 : 720;
    this.buf.width = this.cpuSize;
    this.buf.height = this.cpuSize;
    const ctx = this.buf.getContext("2d", { willReadFrequently: true, alpha: true });
    if (!ctx) throw new Error("chroma canvas");
    this.ctx = ctx;
    this.smooth = "medium";
  }

  draw(
    dest: CanvasRenderingContext2D,
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    if (!sourceReady(source)) return;
    dest.imageSmoothingEnabled = true;
    dest.imageSmoothingQuality = this.smooth;
    const packed = isPackedSource(source);

    if (this.gl?.draw(source as TexImageSource, packed)) {
      dest.drawImage(this.gl.canvas, dx, dy, dw, dh);
      return;
    }

    if (packed) {
      this.drawPackedCpu(dest, source, dx, dy, dw, dh);
      return;
    }
    this.drawCpu(dest, source, dx, dy, dw, dh);
  }

  dispose() {
    this.gl?.dispose();
    this.gl = null;
  }

  private drawPackedCpu(
    dest: CanvasRenderingContext2D,
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    const size = this.cpuSize;
    const packedW = size * 2;
    const { ctx, buf } = this;
    if (buf.width !== packedW || buf.height !== size) {
      buf.width = packedW;
      buf.height = size;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.smooth;
    ctx.clearRect(0, 0, packedW, size);
    ctx.drawImage(source, 0, 0, packedW, size);
    const packed = ctx.getImageData(0, 0, packedW, size);
    const out = new ImageData(size, size);
    const src = packed.data;
    const dst = out.data;
    for (let y = 0; y < size; y += 1) {
      const row = y * packedW;
      for (let x = 0; x < size; x += 1) {
        const colorOffset = (row + x) * 4;
        const maskOffset = (row + x + size) * 4;
        const destOffset = (y * size + x) * 4;
        dst[destOffset] = src[colorOffset];
        dst[destOffset + 1] = src[colorOffset + 1];
        dst[destOffset + 2] = src[colorOffset + 2];
        dst[destOffset + 3] = src[maskOffset];
      }
    }
    buf.width = size;
    buf.height = size;
    ctx.putImageData(out, 0, 0);
    dest.drawImage(buf, dx, dy, dw, dh);
  }

  private drawCpu(
    dest: CanvasRenderingContext2D,
    source: CanvasImageSource,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ) {
    const size = this.cpuSize;
    const { ctx, buf } = this;
    if (buf.width !== size || buf.height !== size) {
      buf.width = size;
      buf.height = size;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = this.smooth;
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
      if (r > 158 && g < 50 && hot > 115 && pink > 28) {
        d[i] = 0;
        d[i + 1] = 0;
        d[i + 2] = 0;
        d[i + 3] = 0;
        continue;
      }
      if (!(r > 148 && g < 108 && hot > 52 && pink > 6)) continue;
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

    ctx.putImageData(img, 0, 0);
    dest.drawImage(buf, dx, dy, dw, dh);
  }
}
