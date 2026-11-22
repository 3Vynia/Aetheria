<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { G, state } from '../game/engine.js'
import { session } from '../game/loop.js'
import { SKILLS } from '../game/data/skills.js'
import { ITEMS } from '../game/data/items.js'
import { welcomeKind } from '../game/data/questVoices.js'
import { fmt, fmtTime } from '../game/format.js'
import { tm } from '../i18n/index.js'
import { summarise } from '../ui/moments.js'
import { cue } from '../game/sound.js'
import GameIcon from './GameIcon.vue'
import ItemTile from './ItemTile.vue'
import SpokenText from './SpokenText.vue'

/*
  Welcome back: what the hero did while the player was away, told like a report from the tavern.
  The time away and how much of the offline limit it used, the totals counting up, the moments worth
  telling (finds, achievements, pets, expeditions…), the levels climbed, the experience per skill and
  the items gained and used up. Ultra rare finds open their own window once the summary is closed.
*/
const { t } = useI18n()
const off = computed(() => session.offline)
const MOMENTS_SHOWN = 8

const greeting = computed(() => (off.value ? `“${t(`offline.welcome.${welcomeKind(off.value.away ?? off.value.seconds)}`, { name: state.name })}”` : ''))
const what = computed(() => {
  const a = off.value?.activity
  if (!a) return t('offline.idle')
  if (a.type === 'skill') return t('offline.training', { skill: SKILLS[a.skill].name, action: G.getAction(a.skill, a.action)?.name || '' })
  return a.kind === 'tower' ? t('offline.tower') : t('offline.fighting', { monster: G.getMonster(a)?.name || '' })
})
// How much of the offline limit the time away filled, for the ring around the clock
const capH = computed(() => (off.value?.cap ? off.value.cap / 3600 : G.offlineCapHours()))
const filled = computed(() => (off.value ? Math.min(1, off.value.seconds / (capH.value * 3600)) : 0))
const RING = 2 * Math.PI * 34

const told = computed(() => summarise(off.value?.moments))
const showAll = ref(false)
const moments = computed(() => (showAll.value ? told.value.list : told.value.list.slice(0, MOMENTS_SHOWN)))
const hidden = computed(() => Math.max(0, told.value.list.length - MOMENTS_SHOWN))

const kills = computed(() => Object.values(off.value?.kills || {}).reduce((a, b) => a + b, 0))
const skills = computed(() => {
  const from = off.value?.from?.skills || {}
  const rows = Object.entries(off.value?.xp || {}).filter(([k, v]) => SKILLS[k] && v >= 1).sort((a, b) => b[1] - a[1])
  const top = rows[0]?.[1] || 1
  return rows.map(([k, xp]) => ({ k, xp, share: Math.max(0.04, xp / top), from: from[k], to: off.value.levels?.[k] || null }))
})
const totalXp = computed(() => skills.value.reduce((a, s) => a + s.xp, 0))
const levelUps = computed(() => skills.value.filter(s => s.to))
const items = computed(() => Object.entries(off.value?.items || {}).filter(([k, v]) => ITEMS[k] && Math.round(v) !== 0))
const gained = computed(() => items.value.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]))
const used = computed(() => items.value.filter(([, v]) => v < 0).sort((a, b) => a[1] - b[1]))

// The big numbers at the top, each only when there is something to show
const tiles = computed(() => {
  const o = off.value
  if (!o) return []
  const heroFrom = o.from?.hero
  return [
    o.gold > 0 && { id: 'gold', icon: 'two-coins', label: t('common.gold'), value: o.gold, prefix: '+', tone: 'gold' },
    totalXp.value > 0 && { id: 'xp', icon: 'upgrade', label: t('offline.experience'), value: totalXp.value, prefix: '+', tone: 'ok' },
    kills.value > 0 && { id: 'kills', icon: 'crossed-swords', label: t('offline.kills'), value: kills.value, tone: 'ember' },
    o.heroLevel && { id: 'hero', icon: 'laurel-crown', label: t('hero.heroLevel'), value: o.heroLevel, from: heroFrom, tone: 'gold' },
    o.tokens > 0 && { id: 'tokens', icon: 'stone-tower', label: t('offline.towerTokens'), value: o.tokens, prefix: '+', tone: 'arcane' },
    o.eaten > 0 && { id: 'eaten', icon: 'meat', label: t('offline.eaten'), value: o.eaten, tone: 'muted' },
    told.value.deaths > 0 && { id: 'deaths', icon: 'death-skull', label: t('offline.deaths'), value: told.value.deaths, tone: 'bad' },
  ].filter(Boolean)
})

/* The numbers count up when the summary opens (at once with reduced motion) */
const shown = ref({})
let raf = 0
const still = () => state.settings.reduceMotion || !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
function countUp() {
  cancelAnimationFrame(raf)
  const goal = Object.fromEntries(tiles.value.map(x => [x.id, x.value]))
  if (still()) { shown.value = goal; return }
  const start = performance.now(), DUR = 1100
  const step = now => {
    const p = Math.min(1, (now - start) / DUR), e = 1 - Math.pow(1 - p, 3)
    shown.value = Object.fromEntries(Object.entries(goal).map(([k, v]) => [k, v * e]))
    if (p < 1) raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
}
const showValue = x => (x.id === 'hero' ? x.value : fmt(Math.round(shown.value[x.id] ?? 0)))

watch(off, o => {
  showAll.value = false
  if (!o) return
  countUp()
  if (told.value.list.some(m => m.kind === 'myth' || m.kind === 'rare')) cue('rareDrop')
}, { immediate: true })
onUnmounted(() => cancelAnimationFrame(raf))

function close() {
  // Ultra rare finds made while away get the window they would have had
  const finds = (off.value?.moments || []).filter(m => m.evt === 'mythic')
  session.offline = null
  for (const m of finds) G.emit('mythic', m.data)
}
</script>

<template>
  <Dialog :visible="!!off" modal class="os-dialog" style="width: min(660px, calc(100vw - 24px))" :header="$t('offline.title')" @update:visible="v => v || close()">
    <div v-if="off" class="os">
      <!-- The time away, as a clock filled up to the offline limit -->
      <section class="os-hero" style="--i:0">
        <div class="os-clock" :class="{ capped: off.capped }" :title="$t('offline.ofCap', { p: Math.round(filled * 100), h: +capH.toFixed(1) })">
          <svg class="os-ring" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" class="ring-bg" />
            <circle cx="40" cy="40" r="34" class="ring" :style="{ strokeDasharray: RING, strokeDashoffset: RING * (1 - filled), '--ring': RING }" />
          </svg>
          <GameIcon name="hourglass" :size="30" />
        </div>
        <div class="os-away">
          <div class="os-kicker">{{ $t('offline.awayFor') }}</div>
          <div class="os-time">{{ fmtTime(off.away ?? off.seconds) }}</div>
          <div class="os-what">{{ $t('offline.kept', { name: state.name, what }) }}</div>
          <div v-if="off.capped" class="os-cap"><i class="pi pi-hourglass" /> {{ $t('offline.capped', { h: +capH.toFixed(1) }) }}</div>
        </div>
      </section>

      <!-- The keeper's greeting -->
      <section class="os-keeper" style="--i:1">
        <ItemTile icon="beer-horn" tint="#e2b65a" size="sm" :tip="false" />
        <div class="grow">
          <div class="os-keeper-name">{{ $t('offline.keeper') }}</div>
          <SpokenText :text="greeting" voice="keeper" />
        </div>
      </section>

      <!-- Totals -->
      <section v-if="tiles.length" class="os-tiles" style="--i:2">
        <div v-for="x in tiles" :key="x.id" class="os-tile" :class="'tone-' + x.tone">
          <span class="os-tile-icon"><GameIcon :name="x.icon" :size="20" /></span>
          <span class="os-tile-num">
            <small v-if="x.from" class="os-from">{{ x.from }} →</small>{{ x.prefix || '' }}{{ showValue(x) }}
          </span>
          <span class="os-tile-label">{{ x.label }}</span>
        </div>
      </section>

      <!-- What happened worth telling -->
      <section v-if="moments.length" class="os-block" style="--i:3">
        <h3 class="os-title"><GameIcon name="sparkles" :size="16" />{{ $t('offline.highlights') }}</h3>
        <ul class="os-moments">
          <li v-for="(m, i) in moments" :key="m.text" class="os-moment" :class="'k-' + m.kind" :style="{ '--j': i }">
            <span class="os-moment-icon"><GameIcon :name="m.icon" :size="18" /></span>
            <span class="os-moment-text" v-html="m.text" />
            <span v-if="m.n > 1" class="os-times">×{{ m.n }}</span>
          </li>
        </ul>
        <button v-if="hidden && !showAll" class="os-more" type="button" @click="showAll = true">{{ $t('offline.more', { n: hidden }) }}</button>
      </section>

      <!-- Levels climbed -->
      <section v-if="levelUps.length" class="os-block" style="--i:4">
        <h3 class="os-title"><GameIcon name="upgrade" :size="16" />{{ $t('offline.levelUps') }}</h3>
        <div class="os-levels">
          <div v-for="s in levelUps" :key="s.k" class="os-level" :style="{ '--c': SKILLS[s.k].color }">
            <GameIcon :name="SKILLS[s.k].icon" :size="20" />
            <span class="os-level-name">{{ SKILLS[s.k].name }}</span>
            <span class="os-level-step"><span class="muted">{{ s.from }}</span><i class="pi pi-arrow-right" /><b>{{ s.to }}</b></span>
          </div>
        </div>
      </section>

      <!-- Experience per skill -->
      <section v-if="skills.length" class="os-block" style="--i:5">
        <h3 class="os-title"><GameIcon name="open-book" :size="16" />{{ $t('offline.experience') }}</h3>
        <div class="os-skills">
          <div v-for="s in skills" :key="s.k" class="os-skill" :style="{ '--c': SKILLS[s.k].color }">
            <GameIcon :name="SKILLS[s.k].icon" :size="18" class="os-skill-icon" />
            <span class="os-skill-name">{{ SKILLS[s.k].name }}</span>
            <span class="os-bar"><span :style="{ width: s.share * 100 + '%' }" /></span>
            <b class="os-skill-xp">+{{ fmt(s.xp) }}</b>
          </div>
        </div>
      </section>

      <!-- Items -->
      <section v-if="gained.length" class="os-block" style="--i:6">
        <h3 class="os-title"><GameIcon name="open-treasure-chest" :size="16" />{{ $t('offline.gained') }}</h3>
        <div class="os-items">
          <div v-for="[k, v] in gained" :key="k" class="os-item">
            <ItemTile :item="k" size="md" :qty="Math.round(v)" />
            <span class="os-item-name">{{ ITEMS[k].name }}</span>
          </div>
        </div>
      </section>
      <section v-if="used.length" class="os-block os-used" style="--i:7">
        <h3 class="os-title"><GameIcon name="cooking-pot" :size="16" />{{ $t('offline.used') }}</h3>
        <div class="os-chips">
          <span v-for="[k, v] in used" :key="k" class="os-chip"><ItemTile :item="k" size="xs" />{{ ITEMS[k].name }}<b>{{ fmt(Math.round(v)) }}</b></span>
        </div>
      </section>

      <p v-if="off.stopReason" class="os-stop" style="--i:8"><i class="pi pi-pause-circle" /> {{ tm(off.stopReason) }}</p>
    </div>
    <template #footer>
      <Button :label="$t('offline.collect')" icon="pi pi-check" class="os-collect" autofocus @click="close" />
    </template>
  </Dialog>
</template>

<style scoped>
.os { display: flex; flex-direction: column; gap: 16px; }
.os > * { animation: os-in 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both; animation-delay: calc(var(--i, 0) * 70ms); }
@keyframes os-in { from { opacity: 0; transform: translateY(8px); } }

/* Time away */
.os-hero { position: relative; display: flex; align-items: center; gap: 18px; padding: 18px; border-radius: var(--radius); overflow: hidden;
  border: 1px solid var(--line-hi); background:
    radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--gold) 18%, transparent), transparent 60%),
    radial-gradient(90% 120% at 100% 100%, color-mix(in srgb, var(--violet) 12%, transparent), transparent 60%), var(--tint-1); }
.os-clock { position: relative; flex: 0 0 auto; width: 84px; height: 84px; display: grid; place-items: center; color: var(--gold); }
.os-clock .os-ring { position: absolute; inset: 0; transform: rotate(-90deg); }
.os-clock circle { fill: none; stroke-width: 6; }
.ring-bg { stroke: var(--track); }
.ring { stroke: var(--gold); stroke-linecap: round; animation: os-ring 1.3s 0.2s cubic-bezier(0.2, 0.8, 0.2, 1) both; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--gold) 60%, transparent)); }
.os-clock.capped .ring { stroke: var(--warn); }
@keyframes os-ring { from { stroke-dashoffset: var(--ring); } }
.os-away { min-width: 0; }
.os-kicker { font-size: 11px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.os-time { font-family: var(--font-display); font-size: clamp(1.9rem, 6vw, 2.5rem); line-height: 1.1; background: var(--gold-grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
.os-what { color: var(--ink-2); line-height: 1.4; }
.os-cap { margin-top: 6px; display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--warn); }

/* Keeper */
.os-keeper { display: flex; align-items: center; gap: 12px; padding: 10px 14px; border-radius: 12px; border-inline-start: 3px solid var(--gold); background: var(--tint-1); font-style: italic; color: var(--ink-2); line-height: 1.45; }
.os-keeper-name { font-style: normal; font-size: 11px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold); }

/* Totals */
.os-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(132px, 1fr)); gap: 10px; }
.os-tile { --c: var(--gold); position: relative; display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--c) 30%, var(--line)); background: linear-gradient(160deg, color-mix(in srgb, var(--c) 11%, transparent), transparent 70%), var(--tint-1); }
.os-tile-icon { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 10px; margin-bottom: 4px; color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); }
.os-tile-num { font-size: 1.45rem; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--ink); line-height: 1.15; }
.os-from { font-size: 0.8rem; font-weight: 700; color: var(--muted); margin-inline-end: 4px; }
.os-tile-label { font-size: 12.5px; color: var(--muted); }
.os-tile-label::first-letter { text-transform: uppercase; }
.tone-gold { --c: var(--gold); } .tone-ok { --c: var(--ok); } .tone-ember { --c: var(--ember); } .tone-arcane { --c: var(--arcane); }
.tone-muted { --c: var(--faint); } .tone-bad { --c: var(--danger); }

/* Sections */
.os-title { display: flex; align-items: center; gap: 8px; margin: 0 0 10px; font-family: var(--font-display); font-weight: 400; font-size: 1.05rem; letter-spacing: 0.04em; color: var(--gold-hi); }
.os-title .gi { color: var(--gold); }

/* Moments */
.os-moments { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.os-moment { --c: var(--ok); display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: var(--tint-1);
  border: 1px solid var(--line); border-inline-start: 3px solid var(--c); animation: os-in 0.4s both; animation-delay: calc(300ms + var(--j) * 50ms); }
.os-moment-icon { flex: 0 0 auto; width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; color: var(--c); background: color-mix(in srgb, var(--c) 15%, transparent); }
.os-moment-text { flex: 1; min-width: 0; line-height: 1.4; color: var(--ink-2); }
.os-moment-text :deep(b) { color: var(--ink); }
.os-times { flex: 0 0 auto; padding: 2px 8px; border-radius: 99px; font-size: 12px; font-weight: 800; color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
.k-myth { --c: var(--violet); background: linear-gradient(90deg, color-mix(in srgb, var(--violet) 14%, transparent), transparent 70%), var(--tint-1); box-shadow: 0 0 18px -8px var(--violet); }
.k-rare { --c: var(--gold); background: linear-gradient(90deg, color-mix(in srgb, var(--gold) 10%, transparent), transparent 70%), var(--tint-1); }
.k-success { --c: var(--ok); } .k-warn { --c: var(--danger); } .k-info { --c: var(--sky); }
.os-more { margin-top: 8px; padding: 6px 12px; border: 1px dashed var(--line-hi); border-radius: 99px; background: none; color: var(--gold); font: inherit; font-weight: 700; cursor: pointer; }
.os-more:hover { background: var(--tint-2); }

/* Levels */
.os-levels { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 8px; }
.os-level { position: relative; overflow: hidden; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; color: var(--c);
  border: 1px solid color-mix(in srgb, var(--c) 35%, var(--line)); background: linear-gradient(135deg, color-mix(in srgb, var(--c) 14%, transparent), transparent 75%); }
.os-level::after { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, rgba(255, 255, 255, 0.16) 50%, transparent 65%); transform: translateX(-100%); animation: os-shine 2.6s 0.8s ease-in-out; }
@keyframes os-shine { to { transform: translateX(100%); } }
.os-level-name { flex: 1; min-width: 0; font-weight: 700; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-level-step { display: inline-flex; align-items: center; gap: 6px; font-variant-numeric: tabular-nums; }
.os-level-step i { font-size: 10px; color: var(--muted); }
.os-level-step b { font-size: 1.1rem; color: var(--gold-hi); }

/* Experience */
.os-skills { display: flex; flex-direction: column; gap: 8px; }
.os-skill { display: grid; grid-template-columns: 20px minmax(80px, 140px) 1fr auto; align-items: center; gap: 10px; }
.os-skill-icon { color: var(--c); }
.os-skill-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.os-bar { height: 8px; border-radius: 99px; background: var(--track); overflow: hidden; }
.os-bar span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 60%, transparent), var(--c)); transform-origin: left; animation: os-grow 1s 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@keyframes os-grow { from { transform: scaleX(0); } }
.os-skill-xp { font-variant-numeric: tabular-nums; color: var(--tag-ok); }

/* Items */
.os-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); gap: 10px; }
.os-item { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.os-item-name { font-size: 12px; line-height: 1.25; color: var(--ink-2); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.os-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.os-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: 99px; background: var(--tint-1); border: 1px solid var(--line); font-size: 13px; color: var(--ink-2); }
.os-chip b { color: var(--tag-bad); font-variant-numeric: tabular-nums; }
.os-stop { margin: 0; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--warn) 10%, transparent); border: 1px solid color-mix(in srgb, var(--warn) 35%, transparent); color: var(--ink-2); }
.os-stop i { color: var(--warn); }
.os-collect { min-width: 160px; }

@media (max-width: 520px) {
  .os-hero { padding: 14px; gap: 14px; }
  .os-clock { width: 68px; height: 68px; }
  .os-tiles { grid-template-columns: repeat(2, 1fr); }
  .os-skill { grid-template-columns: 18px minmax(70px, 110px) 1fr auto; gap: 8px; }
}
:root[data-motion='reduce'] .os *, :root[data-motion='reduce'] .os > * { animation: none !important; transition: none !important; }
@media (prefers-reduced-motion: reduce) { .os *, .os > * { animation: none !important; transition: none !important; } }
</style>
