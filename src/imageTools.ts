import type { Sprite } from './data'

export interface SpriteOptions {
  removeBg: boolean
  /** 0..100, how different from the background colour a pixel must be to stay */
  tolerance: number
  /** draw a wooden hanger above the garment so it hangs on the rail */
  hanger: boolean
}

const DISPLAY_H = 300 // garment height on the rail at 1x (existing sprites are ~300-400)
const DISPLAY_MAX_W = 270
const HANGER_H = 42

async function readBitmap(file: File | Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' })
}

/** Removes a plain background: flood-fills from the image border over pixels close to the border colour. */
function cutBackground(ctx: CanvasRenderingContext2D, w: number, h: number, tolerance: number) {
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  // background colour = median of the border pixels
  const rs: number[] = []
  const gs: number[] = []
  const bs: number[] = []
  const sample = (x: number, y: number) => {
    const i = (y * w + x) * 4
    rs.push(d[i])
    gs.push(d[i + 1])
    bs.push(d[i + 2])
  }
  for (let x = 0; x < w; x += 2) {
    sample(x, 0)
    sample(x, h - 1)
  }
  for (let y = 0; y < h; y += 2) {
    sample(0, y)
    sample(w - 1, y)
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]
  const br = med(rs)
  const bg = med(gs)
  const bb = med(bs)
  const dist = (i: number) => Math.hypot(d[i] - br, d[i + 1] - bg, d[i + 2] - bb)
  const tol = Math.max(4, tolerance * 2.2)

  const isBg = new Uint8Array(w * h)
  const queue = new Uint32Array(w * h)
  let head = 0
  let tail = 0
  const push = (x: number, y: number) => {
    const k = y * w + x
    if (isBg[k] || dist(k * 4) > tol) return
    isBg[k] = 1
    queue[tail++] = k
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (head < tail) {
    const k = queue[head++]
    const x = k % w
    const y = (k - x) / w
    if (x > 0) push(x - 1, y)
    if (x < w - 1) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y < h - 1) push(x, y + 1)
  }
  // soft edge: kept pixels touching the background fade by how close they are to the background colour
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = y * w + x
      const i = k * 4
      if (isBg[k]) {
        d[i + 3] = 0
        continue
      }
      const near =
        (x > 0 && isBg[k - 1]) || (x < w - 1 && isBg[k + 1]) || (y > 0 && isBg[k - w]) || (y < h - 1 && isBg[k + w])
      if (near) {
        const a = Math.min(1, Math.max(0, (dist(i) - tol * 0.45) / (tol * 0.8)))
        d[i + 3] = Math.round(255 * a)
      }
    }
  }
  ctx.putImageData(img, 0, 0)
}

function alphaBounds(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const d = ctx.getImageData(0, 0, w, h).data
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h }
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
}

function drawHanger(ctx: CanvasRenderingContext2D, R: number, gw: number) {
  const cx = (gw / 2) * R
  const aw = Math.min(gw * (gw < 130 ? 0.7 : 0.92), gw - 6) * R
  const wood = ctx.createLinearGradient(0, 0, 0, HANGER_H * R)
  wood.addColorStop(0, '#b98a57')
  wood.addColorStop(1, '#7a5330')
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  // hook
  ctx.strokeStyle = '#9b9b9b'
  ctx.lineWidth = 2.2 * R
  ctx.beginPath()
  ctx.moveTo(cx - 4 * R, 7 * R)
  ctx.arc(cx, 6 * R, 4 * R, Math.PI, Math.PI * 2.1)
  ctx.lineTo(cx + 0.4 * R, 9 * R)
  ctx.lineTo(cx, 17 * R)
  ctx.stroke()
  // wooden arms
  ctx.strokeStyle = wood
  ctx.lineWidth = 5 * R
  ctx.beginPath()
  ctx.moveTo(cx - aw / 2, (HANGER_H + 6) * R)
  ctx.quadraticCurveTo(cx - aw * 0.18, 17 * R, cx, 16 * R)
  ctx.quadraticCurveTo(cx + aw * 0.18, 17 * R, cx + aw / 2, (HANGER_H + 6) * R)
  ctx.stroke()
}

/**
 * Turns an uploaded photo into a rail sprite: optional background removal, crop, optional hanger,
 * sized like the existing sprites (1x CSS size + a high-resolution WebP).
 */
export async function buildSprite(file: File | Blob, o: SpriteOptions): Promise<Sprite> {
  const bmp = await readBitmap(file)
  const k0 = Math.min(1, 1600 / Math.max(bmp.width, bmp.height))
  const sw = Math.max(1, Math.round(bmp.width * k0))
  const sh = Math.max(1, Math.round(bmp.height * k0))
  const src = document.createElement('canvas')
  src.width = sw
  src.height = sh
  const sctx = src.getContext('2d', { willReadFrequently: true })!
  sctx.drawImage(bmp, 0, 0, sw, sh)
  bmp.close()
  if (o.removeBg) cutBackground(sctx, sw, sh, o.tolerance)
  const b = o.removeBg ? alphaBounds(sctx, sw, sh) : { x: 0, y: 0, w: sw, h: sh }

  const k = Math.min(DISPLAY_H / b.h, DISPLAY_MAX_W / b.w) // source px -> 1x CSS px
  const gw = b.w * k
  const gh = b.h * k
  const R = Math.min(4, 1 / k) // output pixels per 1x px (never upscale the photo)
  const hh = o.hanger ? HANGER_H : 0
  const overlap = o.hanger ? 8 : 0
  const w1 = Math.ceil(gw)
  const h1 = Math.ceil(hh + gh - overlap)

  const out = document.createElement('canvas')
  out.width = Math.round(w1 * R)
  out.height = Math.round(h1 * R)
  const ctx = out.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  if (o.hanger) drawHanger(ctx, R, w1)
  ctx.drawImage(src, b.x, b.y, b.w, b.h, ((w1 - gw) / 2) * R, (hh - overlap) * R, gw * R, gh * R)

  const url = out.toDataURL('image/webp', 0.9)
  return { src: url, w: w1, h: h1, hookX: w1 / 2 }
}
