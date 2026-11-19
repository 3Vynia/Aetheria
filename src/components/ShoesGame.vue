<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import { G, state } from '../game/engine.js'
import { SHOE_THROWS, SHOE_RINGS, SHOE_PAYS } from '../game/data/tavern.js'
import { fmt } from '../game/format.js'
import { play } from '../game/sound.js'
import GameIcon from './GameIcon.vue'
import GameTable from './GameTable.vue'
import BetInput from './BetInput.vue'

// Horseshoes: each toss is set in two steps, first how hard (the gauge beside the pit) and then the
// line (the gauge below it). The closer both stop to the middle, the closer the shoe lands to the stake
const bet = ref(Math.min(100, Math.max(10, G.maxBet())))
const game = computed(() => (void state.tavern.games, G.table('shoes')))
const round = computed(() => game.value.round)
const playing = computed(() => G.tableOpen('shoes'))
const thrown = computed(() => round.value?.throws || [])
const total = computed(() => thrown.value.reduce((s, x) => s + x.pts, 0))
const pace = computed(() => G.shoesPace())
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.motion === 'reduce'

// The pit is drawn larger than the scoring distances so the rings read well
const K = 1.7
const RINGS = SHOE_RINGS.map(r => ({ ...r, R: r.r * K }))

/* ---------- the gauges ---------- */
// step: 'power' while the first gauge sweeps, 'line' for the second, 'flying' while the shoe is in the air
const step = ref('power')
const gauge = ref(0)
const power = ref(null)
const flying = ref(null)
let raf = 0, t0 = 0
function frame(now) {
  const t = (now - t0) / 1000
  gauge.value = Math.sin(Math.PI * 2 * pace.value * t * (step.value === 'line' ? 1.15 : 1))
  const f = flying.value
  if (f) {
    f.p = Math.min(1, (now - f.at) / 520)
    if (f.p >= 1) land()
  }
  raf = requestAnimationFrame(frame)
}
onMounted(() => { t0 = performance.now(); raf = requestAnimationFrame(frame) })
onUnmounted(() => cancelAnimationFrame(raf))

function start() {
  G.tableClear('shoes')
  if (!G.shoesStart(bet.value)) return G.toast('horseshoe', 'tavern.badBet', {}, 'warn')
  step.value = 'power'
  power.value = null
  play('dice')
}
function press() {
  if (!playing.value || step.value === 'flying') return
  if (step.value === 'power') {
    power.value = gauge.value
    step.value = 'line'
    t0 = performance.now() - Math.random() * 400
    return
  }
  const shot = G.shoesThrow(power.value, gauge.value)
  if (!shot) return
  step.value = 'flying'
  flying.value = { shot, at: performance.now(), p: still() ? 1 : 0 }
  if (still()) land()
}
function land() {
  const { shot } = flying.value
  flying.value = null
  step.value = 'power'
  power.value = null
  const r = round.value
  play(r?.result ? (r.result.net > 0 ? (r.result.total >= SHOE_PAYS[0].min ? 'rare' : 'coin') : r.result.net < 0 ? 'bad' : 'dice') : shot.pts >= 2 ? 'coin' : 'dice')
}
function onKey(e) { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); press() } }

// Where a shoe sits on the drawing, and the one in the air on its arc from the hero's hand
const at = s => ({ x: Math.max(-0.95, Math.min(0.95, s.x * K)), y: Math.max(-0.95, Math.min(0.95, s.y * K)) })
const inAir = computed(() => {
  const f = flying.value
  if (!f) return null
  const end = at(f.shot), e = f.p
  return { x: end.x * e, y: 1.35 + (end.y - 1.35) * e - Math.sin(Math.PI * e) * 0.55, s: 1.6 - 0.6 * e, r: e * 540 }
})
// Where the marks of this round's shoes sit (the one still in the air is not drawn yet)
const landed = computed(() => thrown.value.slice(0, flying.value ? -1 : undefined).map((s, i) => ({ ...s, ...at(s), i })))
</script>

<template>
  <GameTable icon="horseshoe" :title="$t('tavern.shoes.title')" help="sections.shoes" :stats="game"
    :extra="[{ label: $t('tavern.figures.best'), value: game.best || 0 }, { label: $t('tavern.shoes.calm'), value: Math.round((1 - pace) / 0.35 * 100) + '%' }]">
    <template #badge><span class="tag">{{ $t('tavern.shoes.badge') }}</span></template>
    <div class="court" :tabindex="playing ? 0 : -1" :aria-label="$t('tavern.shoes.area')" @keydown="onKey" @click="press">
      <svg class="pit" viewBox="-1.1 -1.1 2.2 2.6" role="img" :aria-label="$t('tavern.shoes.pit')">
        <defs>
          <radialGradient id="sand" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#d9b97a" /><stop offset="1" stop-color="#a7834a" /></radialGradient>
          <pattern id="grain" width="0.08" height="0.08" patternUnits="userSpaceOnUse"><circle cx="0.02" cy="0.03" r="0.007" fill="#8a6a3a" opacity="0.5" /><circle cx="0.06" cy="0.065" r="0.005" fill="#f0dcae" opacity="0.6" /></pattern>
        </defs>
        <!-- The boards and the sand -->
        <rect x="-1.08" y="-1.08" width="2.16" height="2.16" rx="0.08" class="boards" />
        <rect x="-1" y="-1" width="2" height="2" rx="0.05" fill="url(#sand)" />
        <rect x="-1" y="-1" width="2" height="2" rx="0.05" fill="url(#grain)" />
        <circle v-for="r in [...RINGS].reverse()" :key="r.id" :r="r.R" class="chalk" :class="r.id" />
        <!-- The stake and its shadow -->
        <ellipse cx="0.05" cy="0.04" rx="0.06" ry="0.03" class="shadow" />
        <circle r="0.045" class="stake" />
        <circle r="0.02" class="stake-top" />
        <!-- The lane up to the pit -->
        <path d="M-0.5,1.08 L-0.7,1.5 L0.7,1.5 L0.5,1.08 Z" class="lane" />

        <!-- Shoes on the ground -->
        <g v-for="s in landed" :key="'s' + s.i" :transform="`translate(${s.x},${s.y}) rotate(${(s.i * 77) % 360})`" class="shoe-down" :class="s.kind">
          <use href="#shoe" />
        </g>
        <g v-for="s in landed" :key="'p' + s.i" :transform="`translate(${s.x},${s.y - 0.14})`">
          <text class="pts" :class="s.kind">{{ s.pts ? '+' + s.pts : '0' }}</text>
        </g>
        <!-- The shoe in the air -->
        <g v-if="inAir" :transform="`translate(${inAir.x},${inAir.y}) scale(${inAir.s}) rotate(${inAir.r})`" class="shoe-air"><use href="#shoe" /></g>
        <symbol id="shoe" viewBox="-0.1 -0.1 0.2 0.2" width="0.2" height="0.2" x="-0.1" y="-0.1" overflow="visible">
          <path d="M-0.07,0.06 C-0.1,-0.02 -0.07,-0.09 0,-0.09 C0.07,-0.09 0.1,-0.02 0.07,0.06 L0.04,0.06 C0.06,0 0.05,-0.055 0,-0.055 C-0.05,-0.055 -0.06,0 -0.04,0.06 Z" class="shoe" />
        </symbol>
      </svg>

      <!-- Strength of the toss -->
      <div class="gauge v" :class="{ live: playing && step === 'power', set: power !== null }" :aria-label="$t('tavern.shoes.power')">
        <span class="sweet" />
        <span class="needle" :style="{ top: 50 + (power ?? (step === 'power' ? gauge : 0)) * 46 + '%' }" />
        <small>{{ $t('tavern.shoes.power') }}</small>
      </div>
      <!-- Its line -->
      <div class="gauge h" :class="{ live: playing && step === 'line' }" :aria-label="$t('tavern.shoes.line')">
        <span class="sweet" />
        <span class="needle" :style="{ left: 50 + (step === 'line' ? gauge : 0) * 46 + '%' }" />
        <small>{{ $t('tavern.shoes.line') }}</small>
      </div>
    </div>

    <div class="tally">
      <div v-for="i in SHOE_THROWS" :key="i" class="slot" :class="thrown[i - 1]?.kind">
        <GameIcon name="horseshoe" :size="18" />
        <span>{{ thrown[i - 1] ? $t('tavern.shoes.kinds.' + thrown[i - 1].kind) : '—' }}</span>
        <b class="tnum">{{ thrown[i - 1] ? thrown[i - 1].pts : '' }}</b>
      </div>
      <div class="slot total"><span>{{ $t('tavern.shoes.total') }}</span><b class="tnum">{{ thrown.length ? total : '—' }}</b></div>
    </div>

    <div v-if="round?.result && !flying" :key="'r' + game.played" class="banner-result pop" :class="round.result.net > 0 ? 'win' : round.result.net < 0 ? 'loss' : 'even'" role="status">
      <b>{{ $t('tavern.shoes.results.' + round.result.kind, { n: round.result.total }) }}</b>
      <span class="tnum">{{ $t('inventory.goldAmount', { n: (round.result.net > 0 ? '+' : '') + fmt(round.result.net) }) }}</span>
    </div>

    <template #controls>
      <template v-if="playing">
        <Button :label="$t('tavern.shoes.step.' + (step === 'line' ? 'line' : 'power'))" icon="pi pi-stop-circle" fluid size="large" :disabled="step === 'flying'" @click="press" />
        <div class="small faint">{{ $t('tavern.shoes.hint') }}</div>
      </template>
      <template v-else>
        <BetInput v-model="bet" id="shoes-bet" />
        <Button :label="$t('tavern.shoes.start')" icon="pi pi-play" fluid @click="start" />
      </template>
      <div class="pays">
        <span class="small muted">{{ $t('tavern.shoes.pays') }}</span>
        <div v-for="p in SHOE_PAYS" :key="p.min" class="pay small"><span>{{ $t('tavern.shoes.payLine', { n: p.min }) }}</span><b>×{{ p.mult }}</b></div>
      </div>
    </template>
  </GameTable>
</template>

<style scoped>
.court { width: 100%; max-width: 600px; margin: 0 auto; display: grid; grid-template-columns: minmax(0, 1fr) 46px; grid-template-rows: auto auto; gap: 12px; align-items: stretch; outline: none; cursor: pointer; }
.court:focus-visible { outline: 2px solid var(--gold); outline-offset: 4px; border-radius: 12px; }
.pit { width: 100%; max-height: 460px; filter: drop-shadow(0 10px 16px rgba(0, 0, 0, 0.45)); }
.boards { fill: #5a3a1e; stroke: #3a2410; stroke-width: 0.02; }
.chalk { fill: none; stroke: rgba(255, 248, 230, 0.55); stroke-width: 0.012; stroke-dasharray: 0.03 0.025; }
.chalk.ringer { fill: rgba(226, 182, 90, 0.18); stroke: rgba(255, 230, 160, 0.9); stroke-dasharray: none; }
.chalk.leaner { fill: rgba(255, 255, 255, 0.06); }
.shadow { fill: rgba(0, 0, 0, 0.35); }
.stake { fill: #4a4a52; stroke: #222; stroke-width: 0.012; }
.stake-top { fill: #8a8a96; }
.lane { fill: rgba(90, 58, 30, 0.6); }
.shoe { fill: #9aa0aa; stroke: #2a2a30; stroke-width: 0.008; }
.shoe-down.ringer .shoe { fill: #f2c94c; }
.shoe-down.leaner .shoe { fill: #d8dde6; }
.shoe-down.miss .shoe { fill: #6a6a72; }
.shoe-air { filter: drop-shadow(0 0.04px 0.02px rgba(0, 0, 0, 0.5)); }
.pts { font-size: 0.11px; font-weight: 800; text-anchor: middle; fill: #fff; paint-order: stroke; stroke: #3a2410; stroke-width: 0.02px; animation: rise 0.5s ease-out; }
.pts.ringer { fill: #ffd36e; font-size: 0.14px; }
.pts.miss { fill: #c9c0b0; }

.gauge { position: relative; border-radius: 12px; background: var(--panel-solid); border: 1px solid var(--line-hi); overflow: hidden; opacity: 0.6; transition: opacity 0.2s, box-shadow 0.2s; }
.gauge.live { opacity: 1; box-shadow: 0 0 16px -6px var(--gold); }
.gauge.set { opacity: 0.9; }
.gauge small { position: absolute; font-size: 10.5px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; pointer-events: none; }
.gauge.v { grid-row: 1; grid-column: 2; background: linear-gradient(180deg, color-mix(in srgb, var(--danger) 35%, var(--panel-solid)), var(--panel-solid) 35% 65%, color-mix(in srgb, var(--danger) 35%, var(--panel-solid))); }
.gauge.v .sweet { position: absolute; left: 0; right: 0; top: 44%; height: 12%; background: color-mix(in srgb, var(--ok) 45%, transparent); }
.gauge.v .needle { position: absolute; left: 4px; right: 4px; height: 4px; margin-top: -2px; border-radius: 2px; background: var(--gold-hi); box-shadow: 0 0 8px var(--gold); }
.gauge.v small { bottom: 6px; left: 0; right: 0; text-align: center; writing-mode: vertical-rl; transform: rotate(180deg); bottom: auto; top: 6px; }
.gauge.h { grid-row: 2; grid-column: 1 / -1; height: 34px; background: linear-gradient(90deg, color-mix(in srgb, var(--danger) 35%, var(--panel-solid)), var(--panel-solid) 35% 65%, color-mix(in srgb, var(--danger) 35%, var(--panel-solid))); }
.gauge.h .sweet { position: absolute; top: 0; bottom: 0; left: 44%; width: 12%; background: color-mix(in srgb, var(--ok) 45%, transparent); }
.gauge.h .needle { position: absolute; top: 4px; bottom: 4px; width: 4px; margin-left: -2px; border-radius: 2px; background: var(--gold-hi); box-shadow: 0 0 8px var(--gold); }
.gauge.h small { left: 10px; top: 50%; transform: translateY(-50%); }

.tally { width: 100%; max-width: 600px; margin: 0 auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.slot { display: grid; justify-items: center; gap: 2px; padding: 8px 6px; border-radius: 10px; background: var(--panel-solid); border: 1px solid var(--line); font-size: 12.5px; color: var(--muted); }
.slot b { font-size: 17px; color: var(--ink); min-height: 1.2em; }
.slot .gi { color: var(--faint); }
.slot.ringer { border-color: var(--gold); color: var(--gold-hi); }
.slot.ringer .gi { color: var(--gold); }
.slot.leaner .gi, .slot.close .gi { color: var(--ink-2); }
.slot.total { border-color: var(--line-hi); }
.pays { display: grid; gap: 4px; }
.pay { display: flex; justify-content: space-between; padding: 4px 10px; border-radius: 8px; background: var(--panel-solid); border: 1px solid var(--line); }
.pay b { color: var(--gold-hi); }
.banner-result { justify-self: center; display: grid; justify-items: center; gap: 2px; padding: 10px 22px; border-radius: 12px; background: var(--panel-solid); border: 1px solid var(--line-hi); }
.banner-result b { font-family: var(--font-display); font-size: 19px; }
.banner-result.win { border-color: color-mix(in srgb, var(--ok) 55%, transparent); color: var(--tag-ok); }
.banner-result.loss { border-color: color-mix(in srgb, var(--danger) 55%, transparent); color: var(--tag-bad); }
.banner-result.even { color: var(--muted); }
:root[data-theme="light"] .banner-result.win { color: var(--ok); }
:root[data-theme="light"] .banner-result.loss { color: var(--danger); }
.pop { animation: pop 0.35s cubic-bezier(0.2, 0.8, 0.3, 1.3); }
@keyframes pop { 0% { opacity: 0; transform: translateY(6px) scale(0.92); } 100% { opacity: 1; transform: none; } }
@keyframes rise { 0% { opacity: 0; transform: translateY(0.06px); } 100% { opacity: 1; transform: none; } }
@media (max-width: 600px) { .tally { grid-template-columns: repeat(2, minmax(0, 1fr)); } .court { grid-template-columns: minmax(0, 1fr) 38px; } }
@media (prefers-reduced-motion: reduce) { .pop, .pts { animation: none; } }
</style>
