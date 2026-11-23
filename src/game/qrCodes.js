/* =========================================================
   QR — a transfer code (transfer.js) carried as a run of QR codes, for moving a game between devices
   with a camera or a picture and no server. A whole game is too big for one QR, so the code is cut
   into parts; each part says which run it belongs to and where it goes, so they can be read in any
   order, repeated or mixed with another run, and the game comes back once every part is in.
   The parts are shown one after the other for a camera, or drawn side by side in one picture to
   download and load again on the other device.
   ========================================================= */
const TAG = 'AQ1'
// Characters per part: a QR small enough for a phone camera to read off a screen at a glance
export const PART = 700

// A short mark of the whole code, shared by its parts
function runId(code) {
  let h = 2166136261
  for (let i = 0; i < code.length; i++) h = Math.imul(h ^ code.charCodeAt(i), 16777619)
  return (h >>> 0).toString(36).slice(0, 5)
}

export function splitCode(code, size = PART) {
  const id = runId(code)
  const n = Math.max(1, Math.ceil(code.length / size))
  return Array.from({ length: n }, (_, i) => `${TAG}:${id}:${i}:${n}:${code.slice(i * size, (i + 1) * size)}`)
}

export function readPart(text) {
  const m = /^AQ1:([0-9a-z]+):(\d+):(\d+):(.*)$/s.exec(String(text || ''))
  if (!m) return null
  const i = +m[2], n = +m[3]
  return n > 0 && n <= 999 && i < n ? { id: m[1], i, n, data: m[4] } : null
}

// Gathers parts as they are read. A part from another run starts over with that run when the current
// one has barely begun or has stopped coming in (the sender refreshed its codes), so a stray code on the
// way does not throw away a scan that is going well
const STALE = 4000
export function collector(now = () => Date.now()) {
  let run = null
  return {
    add(text) {
      const p = readPart(text)
      if (!p) {
        // A single code (or a link) read whole, as any other QR reader would give it
        const whole = String(text || '').trim()
        return whole.length > 20 && !whole.startsWith(TAG) ? { done: true, code: whole, have: 1, n: 1 } : this.state()
      }
      if (!run || (run.id !== p.id && (run.parts.size <= 1 || now() - run.seen > STALE))) run = { id: p.id, n: p.n, parts: new Map(), seen: now() }
      if (run.id === p.id) { run.parts.set(p.i, p.data); run.seen = now() }
      return this.state()
    },
    state() {
      if (!run) return { done: false, have: 0, n: 0, missing: [] }
      const have = run.parts.size
      const done = have === run.n
      const missing = done ? [] : Array.from({ length: run.n }, (_, i) => i).filter(i => !run.parts.has(i))
      return { done, have, n: run.n, missing, code: done ? Array.from({ length: run.n }, (_, i) => run.parts.get(i)).join('') : null }
    },
  }
}

// Where each part sits in the picture: square cells in rows under a title band
export const sheetCols = n => Math.ceil(Math.sqrt(n))
