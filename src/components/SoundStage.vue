<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { audioAnalyser } from '../game/music.js'

// A living picture of the music: soft glowing shapes that breathe with the low, middle and high bands
// of what is playing, and a ribbon of the waveform. Without sound (or with less motion) it rests.
const props = defineProps({ colors: { type: Array, default: () => ['#e2b65a', '#6f5cd2'] }, active: Boolean })
const canvas = ref(null)
let raf = 0, t0 = 0, freq = null, wave = null
let mix = { low: 0, mid: 0, high: 0 }
// Colours ease from one theme to the next instead of jumping
let cur = null

const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
const lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k)
const rgba = (c, a) => `rgba(${c.map(Math.round).join(',')},${a})`
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce'

function bands() {
  const an = audioAnalyser()
  if (!an || !props.active) { mix = { low: mix.low * 0.95, mid: mix.mid * 0.95, high: mix.high * 0.95 }; return null }
  if (!freq || freq.length !== an.frequencyBinCount) { freq = new Uint8Array(an.frequencyBinCount); wave = new Float32Array(an.fftSize) }
  an.getByteFrequencyData(freq)
  an.getFloatTimeDomainData(wave)
  const avg = (a, b) => { a = Math.floor(a); b = Math.max(a + 1, Math.floor(b)); let s = 0; for (let i = a; i < b; i++) s += freq[i]; return s / (b - a) / 255 }
  const n = freq.length
  const next = { low: avg(1, Math.max(3, n * 0.01)), mid: avg(n * 0.01, n * 0.08), high: avg(n * 0.08, n * 0.3) }
  for (const k in mix) mix[k] += (next[k] - mix[k]) * 0.12
  return wave
}

function draw(now) {
  const el = canvas.value
  if (!el) return
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const w = el.clientWidth, h = el.clientHeight
  if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) { el.width = Math.round(w * dpr); el.height = Math.round(h * dpr) }
  const g = el.getContext('2d')
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const t = (now - t0) / 1000
  const target = props.colors.map(hex)
  cur = cur ? cur.map((c, i) => lerp(c, target[i] || target[0], 0.03)) : target
  const [a, b] = cur
  const data = bands()

  // The sky behind: two deep glows of the theme's colours
  g.globalCompositeOperation = 'source-over'
  g.fillStyle = '#07060d'
  g.fillRect(0, 0, w, h)
  const glow = (x, y, r, c, alpha) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(c, alpha)); gr.addColorStop(1, rgba(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h) }
  glow(w * (0.3 + 0.05 * Math.sin(t * 0.07)), h * 0.35, w * 0.55, a, 0.22 + mix.low * 0.25)
  glow(w * (0.72 + 0.05 * Math.cos(t * 0.05)), h * 0.7, w * 0.5, b, 0.2 + mix.mid * 0.25)

  // The shapes: layered rings whose edges ripple with the music
  g.globalCompositeOperation = 'lighter'
  const cx = w / 2, cy = h / 2, base = Math.min(w, h) * 0.26
  const layers = [[a, 0.22, 3, 0.9, mix.low], [b, 0.18, 5, -0.6, mix.mid], [lerp(a, b, 0.5), 0.14, 7, 0.4, mix.high]]
  layers.forEach(([c, alpha, lobes, spin, energy], li) => {
    const r0 = base * (1 + li * 0.18) * (1 + energy * 0.35)
    g.beginPath()
    for (let i = 0; i <= 120; i++) {
      const th = (i / 120) * Math.PI * 2
      const ripple = Math.sin(th * lobes + t * spin) * (0.06 + energy * 0.22) + Math.sin(th * (lobes + 2) - t * spin * 0.7) * 0.04
      const r = r0 * (1 + ripple)
      const x = cx + Math.cos(th) * r * 1.35, y = cy + Math.sin(th) * r * 0.82
      i ? g.lineTo(x, y) : g.moveTo(x, y)
    }
    g.closePath()
    const fill = g.createRadialGradient(cx, cy, r0 * 0.2, cx, cy, r0 * 1.5)
    fill.addColorStop(0, rgba(c, alpha * 1.6))
    fill.addColorStop(1, rgba(c, 0))
    g.fillStyle = fill
    g.fill()
    g.strokeStyle = rgba(c, 0.25 + energy * 0.5)
    g.lineWidth = 1.2
    g.stroke()
  })

  // The ribbon: the waveform itself, drawn soft across the stage
  if (data) {
    g.beginPath()
    const step = Math.max(1, Math.floor(data.length / 240))
    for (let i = 0, k = 0; i < data.length; i += step, k++) {
      const x = (i / data.length) * w, y = h * 0.78 + data[i] * h * 0.35
      k ? g.lineTo(x, y) : g.moveTo(x, y)
    }
    g.strokeStyle = rgba(lerp(a, [255, 255, 255], 0.4), 0.35)
    g.lineWidth = 1.5
    g.stroke()
  }
  // Fine dust drifting upward
  for (let i = 0; i < 28; i++) {
    const s = (i * 97.13) % 1, x = ((i * 0.618 + t * 0.008 * (1 + s)) % 1) * w, y = h - (((t * 0.02 * (0.5 + s) + i * 0.37) % 1) * h)
    g.fillStyle = rgba(lerp(a, b, s), 0.25 + mix.high * 0.5)
    g.fillRect(x, y, 1.4, 1.4)
  }
  if (!still()) raf = requestAnimationFrame(draw)
}

function startLoop() { cancelAnimationFrame(raf); t0 = t0 || performance.now(); raf = requestAnimationFrame(draw) }
const onVisible = () => (document.hidden ? cancelAnimationFrame(raf) : startLoop())
onMounted(() => { startLoop(); document.addEventListener('visibilitychange', onVisible) })
onUnmounted(() => { cancelAnimationFrame(raf); document.removeEventListener('visibilitychange', onVisible) })
watch(() => props.colors.join(), () => { if (still()) startLoop() })
</script>

<template>
  <canvas ref="canvas" class="stage-canvas" aria-hidden="true" />
</template>

<style scoped>
.stage-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
