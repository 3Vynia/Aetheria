/* QR codes on screen, in a picture and through the camera (qrCodes.js holds the parts themselves).
   Loaded only when the player opens the QR window. */
import encodeQR from 'qr'
import decodeQR, { decodeQRBatch } from 'qr/decode.js'
import { QRCanvas, frameLoop, rearCamera } from 'qr/dom.js'
import { readPart, sheetCols } from '../game/qrCodes.js'

const OPTS = { ecc: 'low', border: 4 }

export const qrSvg = text => encodeQR(text, 'svg', OPTS)

/* ---------- one picture with every part ---------- */
const SCALE = 4
export async function sheetBlob(parts, title, subtitle) {
  const mats = parts.map(p => encodeQR(p, 'raw', OPTS))
  const size = Math.max(...mats.map(m => m.length))
  const cell = size * SCALE + 24
  const cols = sheetCols(parts.length)
  const rows = Math.ceil(parts.length / cols)
  const band = Math.max(110, Math.round(cell * 0.45))
  const canvas = document.createElement('canvas')
  canvas.width = cols * cell
  canvas.height = band + rows * cell
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#1b1712'
  ctx.textAlign = 'center'
  ctx.font = `bold ${Math.round(band * 0.3)}px serif`
  ctx.fillText(title, canvas.width / 2, band * 0.45)
  ctx.font = `${Math.round(band * 0.17)}px sans-serif`
  ctx.fillStyle = '#5a5248'
  ctx.fillText(subtitle, canvas.width / 2, band * 0.78)
  ctx.fillStyle = '#000'
  mats.forEach((m, k) => {
    const pad = (cell - m.length * SCALE) / 2
    const ox = (k % cols) * cell + pad
    const oy = band + Math.floor(k / cols) * cell + pad
    for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) ctx.fillRect(ox + x * SCALE, oy + y * SCALE, SCALE, SCALE)
  })
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
}

/* ---------- reading pictures ---------- */
async function pixels(file) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return ctx.getImageData(0, 0, canvas.width, canvas.height)
}
const tryDecode = img => { try { return decodeQR(img, { effort: Infinity, timeLimit: 2000 }) } catch { return null } }
const crop = (img, x0, y0, w, h) => {
  const out = new ImageData(w, h)
  for (let y = 0; y < h; y++) out.data.set(img.data.subarray(((y0 + y) * img.width + x0) * 4, ((y0 + y) * img.width + x0 + w) * 4), y * w * 4)
  return out
}

// Feeds every code found in a picture to the collector: a single QR, a screenshot of one, or the
// picture with every part (each cell is read on its own when the whole picture is not enough)
export async function readPicture(file, col) {
  const img = await pixels(file)
  let state = col.state()
  const [found = []] = await decodeQRBatch([img], { effort: Infinity }).catch(() => [[]])
  for (const r of found) if (typeof r === 'string') state = col.add(r)
  if (!found.some(r => typeof r === 'string')) { const one = tryDecode(img); if (one) state = col.add(one) }
  if (state.done || !state.n) return state
  // The picture made by the game: square cells under a title band
  const p = found.map(r => (typeof r === 'string' ? readPart(r) : null)).find(Boolean)
  const n = p?.n || state.n
  const cols = sheetCols(n)
  const cw = img.width / cols
  const top = img.height - Math.ceil(n / cols) * cw
  if (top < 0) return state
  for (const i of state.missing) {
    const x0 = Math.floor((i % cols) * cw), y0 = Math.floor(top + Math.floor(i / cols) * cw)
    const w = Math.min(Math.floor(cw), img.width - x0), h = Math.min(Math.floor(cw), img.height - y0)
    const one = tryDecode(crop(img, x0, y0, w, h))
    if (one) state = col.add(one)
  }
  return state
}

/* ---------- the camera ---------- */
// Reads codes from the camera into `onText` until stopped; resolves with the stop function
export async function startCamera(video, onText) {
  const canvas = new QRCanvas()
  const camera = await rearCamera(video)
  let busy = false
  const cancel = frameLoop(async () => {
    if (busy) return
    busy = true
    try {
      const r = await camera.readFrame(canvas)
      if (typeof r === 'string') onText(r)
      else if (Array.isArray(r)) r.forEach(x => typeof x === 'string' && onText(x))
    } catch { /* a frame with no code */ }
    busy = false
  })
  return {
    stop() { cancel(); camera.stop() },
    devices: () => camera.listDevices(),
    use: id => camera.setDevice(id),
  }
}
