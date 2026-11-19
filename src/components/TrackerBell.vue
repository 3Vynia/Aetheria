<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import Popover from 'primevue/popover'
import { state } from '../game/engine.js'
import { ITEMS } from '../game/data/items.js'
import { SKILLS } from '../game/data/skills.js'
import { trackedGoals } from '../ui/tracker.js'
import { throttled } from '../ui/throttled.js'
import { goTo } from '../ui/focus.js'
import { fmt } from '../game/format.js'
import GameIcon from './GameIcon.vue'
import ItemTile from './ItemTile.vue'

// The tracking board: a quiet button beside the hero with a count, opening every objective on the go
// sorted by where it comes from. A row takes the hero straight to where it is done
const router = useRouter()
const pop = ref(null)
const open = ref(false)
const on = computed(() => state.tutorial.done)
const goals = throttled(() => (on.value ? trackedGoals() : []))
const ready = computed(() => goals.value.filter(g => g.ready).length)
// Whether to show the count on the button at all (Settings)
const counting = computed(() => state.settings.goalBar !== false)

// The sections of the board, in this order
const GROUPS = [
  { id: 'story', icon: 'scroll-unfurled', sources: ['quest', 'story'] },
  { id: 'jobs', icon: 'swords-emblem', sources: ['slayer', 'guild', 'companion'] },
  { id: 'tavern', icon: 'beer-horn', sources: ['order'] },
  { id: 'tasks', icon: 'calendar', sources: ['daily', 'weekly'] },
]
const FILTER_STORE = 'aetheria-tracker-filter'
const filter = ref((() => { try { return localStorage.getItem(FILTER_STORE) || 'all' } catch { return 'all' } })())
watch(filter, v => { try { localStorage.setItem(FILTER_STORE, v) } catch { /* storage unavailable */ } })
const groups = computed(() => GROUPS.map(g => ({ ...g, list: goals.value.filter(x => g.sources.includes(x.source)) })))
const shown = computed(() => groups.value.filter(g => g.list.length && (filter.value === 'all' || filter.value === g.id)))
// Goals that changed to ready since the board was last opened light the button up
const SEEN_STORE = 'aetheria-tracker-seen'
const seen = ref((() => { try { return JSON.parse(localStorage.getItem(SEEN_STORE) || '[]') } catch { return [] } })())
const fresh = computed(() => goals.value.some(g => g.ready && !seen.value.includes(g.key)))
function markSeen() {
  seen.value = goals.value.filter(g => g.ready).map(g => g.key)
  try { localStorage.setItem(SEEN_STORE, JSON.stringify(seen.value)) } catch { /* storage unavailable */ }
}
function toggle(e) { pop.value.toggle(e) }
function go(target) {
  pop.value.hide()
  goTo(router, target)
}
</script>

<template>
  <template v-if="on">
    <button class="tb-bell" :class="{ 'tb-fresh': fresh, 'tb-active': open }" :aria-label="$t('tracker.button', { n: goals.length })" v-tooltip.bottom="$t('tracker.title')" @click="toggle">
      <GameIcon name="scroll-unfurled" :size="18" />
      <span v-if="counting && goals.length" class="tb-count tnum" :class="{ ok: ready }">{{ ready || goals.length }}</span>
    </button>
    <Popover ref="pop" class="tracker-pop" @show="open = true; markSeen()" @hide="open = false">
      <div class="tb-board">
        <header class="tb-board-head">
          <b>{{ $t('tracker.title') }}</b>
          <span v-if="ready" class="tag ok"><i class="pi pi-check" /> {{ $t('tracker.readyCount', { n: ready }) }}</span>
          <span class="grow" />
          <router-link to="/quests" class="tb-all small" @click="pop.hide()">{{ $t('tracker.seeAll') }} <i class="pi pi-angle-right" /></router-link>
        </header>
        <div class="tb-filters" role="tablist">
          <button type="button" role="tab" class="tb-filter" :class="{ on: filter === 'all' }" :aria-selected="filter === 'all'" @click="filter = 'all'">
            {{ $t('tracker.groups.all') }} <span class="tb-n">{{ goals.length }}</span>
          </button>
          <button v-for="g in groups" :key="g.id" type="button" role="tab" class="tb-filter" :class="{ on: filter === g.id }" :aria-selected="filter === g.id" :disabled="!g.list.length" @click="filter = g.id">
            <GameIcon :name="g.icon" :size="13" /> {{ $t('tracker.groups.' + g.id) }} <span class="tb-n">{{ g.list.length }}</span>
          </button>
        </div>
        <div class="tb-board-body">
          <p v-if="!shown.length" class="small muted tb-empty">{{ $t('tracker.empty') }}</p>
          <section v-for="g in shown" :key="g.id" class="tb-group">
            <div class="tb-group-name">{{ $t('tracker.groups.' + g.id) }}</div>
            <div v-for="x in g.list" :key="x.key" class="tb-row-goal" :class="{ ready: x.ready }">
              <button class="tb-main" @click="go(x.go)">
                <ItemTile :item="x.item || null" :icon="x.item ? null : x.icon" size="sm" :tip="false" />
                <span class="tb-text">
                  <small class="tb-from">{{ x.from }}</small>
                  <span class="tb-what">{{ x.text }}</span>
                  <span v-if="x.max && !x.ready" class="bar thin tb-prog"><i :style="{ width: (x.cur / x.max) * 100 + '%' }" /></span>
                </span>
                <span v-if="x.ready" class="tag ok tb-state"><i class="pi pi-check" /></span>
                <span v-else-if="x.max" class="small muted tnum tb-state">{{ fmt(x.cur) }}/{{ fmt(x.max) }}</span>
                <i class="pi pi-angle-right tb-go" />
              </button>
              <div v-if="!x.ready && (x.go.need?.length || x.go.level)" class="tb-need">
                <span v-if="x.go.level" class="small faint">{{ $t('tracker.needShort', { skill: SKILLS[x.go.level.skill].name, lvl: x.go.level.lvl }) }}</span>
                <button v-for="n in x.go.need || []" :key="n.item" class="tb-need-btn small" @click="go(n.go)">
                  <ItemTile :item="n.item" size="xs" :tip="false" /> {{ ITEMS[n.item].name }}
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Popover>
  </template>
</template>

<style scoped>
.tb-bell { position: relative; flex-shrink: 0; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 12px; border: 1px solid var(--line); background: var(--panel);
  color: var(--ink-2); cursor: pointer; transition: border-color 0.15s, color 0.15s; }
.tb-bell:hover, .tb-bell.tb-active { border-color: var(--line-hi); color: var(--gold-hi); }
.tb-bell:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.tb-count { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; display: grid; place-items: center;
  font-size: 10.5px; font-weight: 800; background: var(--tint-3); color: var(--ink); border: 1px solid var(--line-hi); }
.tb-count.ok { background: var(--ok); color: #fff; border-color: transparent; }
.tb-bell.tb-fresh .tb-count { animation: nudge 1.8s ease-in-out infinite; box-shadow: 0 0 0 0 rgba(98, 193, 126, 0.6); }
@keyframes nudge { 0%, 100% { box-shadow: 0 0 0 0 rgba(98, 193, 126, 0.55); } 60% { box-shadow: 0 0 0 7px rgba(98, 193, 126, 0); } }

.tb-board { width: min(460px, calc(100vw - 28px)); display: flex; flex-direction: column; max-height: min(74vh, 620px); }
.tb-board-head { display: flex; align-items: center; gap: 8px; padding: 2px 2px 10px; }
.tb-board-head b { font-family: var(--font-display); font-size: 16px; letter-spacing: 0.04em; }
.tb-all { color: var(--gold-hi); text-decoration: none; display: inline-flex; align-items: center; gap: 2px; }
.tb-all:hover { text-decoration: underline; }
.tb-filters { display: flex; gap: 5px; overflow-x: auto; scrollbar-width: none; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.tb-filters::-webkit-scrollbar { display: none; }
.tb-filter { flex-shrink: 0; display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 999px; border: 1px solid var(--line); background: none; color: var(--muted);
  font: inherit; font-size: 12.5px; cursor: pointer; }
.tb-filter:hover:not(:disabled) { color: var(--ink); border-color: var(--line-hi); }
.tb-filter.on { color: var(--ink); border-color: var(--gold); background: color-mix(in srgb, var(--gold) 12%, transparent); }
.tb-filter:disabled { opacity: 0.4; cursor: default; }
.tb-filter .tb-n { font-size: 11px; font-weight: 700; color: var(--faint); }
.tb-filter.on .tb-n { color: var(--gold-hi); }
.tb-board-body { overflow-y: auto; padding-top: 6px; margin-inline-end: -6px; padding-inline-end: 6px; }
.tb-empty { padding: 14px 4px; }
.tb-group + .tb-group { margin-top: 8px; }
.tb-group-name { position: sticky; top: 0; z-index: 1; padding: 6px 2px 4px; font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--gold-hi); background: var(--panel-solid); }
.tb-row-goal { border-radius: 10px; }
.tb-row-goal + .tb-row-goal { border-top: 1px solid var(--line); border-radius: 0; }
.tb-main { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 6px; border: 0; border-radius: 10px; background: none; color: var(--ink); font: inherit; text-align: start; cursor: pointer; }
.tb-main:hover { background: var(--tint-2); }
.tb-text { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.tb-from { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tb-what { font-size: 13.5px; line-height: 1.3; }
.tb-row-goal.ready .tb-what { color: var(--tag-ok); }
:root[data-theme="light"] .tb-row-goal.ready .tb-what { color: var(--ok); }
.tb-prog { margin-top: 4px; max-width: 200px; }
.tb-state { flex-shrink: 0; }
.tb-go { flex-shrink: 0; color: var(--gold); font-size: 12px; }
.tb-need { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; padding: 0 6px 7px 48px; }
.tb-need-btn { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px 1px 2px; border-radius: 8px; border: 1px solid var(--line); background: none; color: var(--ink-2); cursor: pointer; font: inherit; }
.tb-need-btn:hover { background: var(--tint-2); color: var(--ink); }
@media (prefers-reduced-motion: reduce) { .tb-bell.tb-fresh .tb-count { animation: none; } }
</style>
