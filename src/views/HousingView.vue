<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import { G, state } from '../game/engine.js'
import { ROOMS } from '../game/data/progression.js'
import { TROPHIES, trophiesIn, PRODUCERS, HOME_STORE_HOURS } from '../game/data/home.js'
import { SKILLS } from '../game/data/skills.js'
import { TRUST_MAX, LOYAL_AT, mercXpNeed, mercIcon, mercTint } from '../game/data/company.js'
import { mercName } from '../ui/company.js'
import { ITEMS } from '../game/data/items.js'
import { BOSSES } from '../game/data/combat.js'
import { fmt, fmtTime, fmtClock } from '../game/format.js'
import { modText } from '../i18n/mods.js'
import { resolveParams } from '../i18n/index.js'
import { play } from '../game/sound.js'
import ItemTile from '../components/ItemTile.vue'
import GameIcon from '../components/GameIcon.vue'
import HelpTip from '../components/HelpTip.vue'

const { t: $tr } = useI18n()
// The house: a floor plan of its rooms, the chosen room beside it and the trophy wall below
const STORE = 'aetheria-home-room'
const picked = ref((() => { try { const v = localStorage.getItem(STORE); return ROOMS.some(r => r.id === v) ? v : ROOMS[0].id } catch { return ROOMS[0].id } })())
watch(picked, v => { try { localStorage.setItem(STORE, v) } catch { /* storage unavailable */ } })
const room = computed(() => ROOMS.find(r => r.id === picked.value))
// Phones get smaller room tiles
const phone = window.matchMedia?.('(max-width: 600px)')
const small = ref(!!phone?.matches)
const onPhone = e => { small.value = e.matches }
onMounted(() => phone?.addEventListener('change', onPhone))
onUnmounted(() => phone?.removeEventListener('change', onPhone))
// On narrow screens the chosen room sits below the plan: bring it into view
const detailEl = ref(null)
function pick(id) {
  picked.value = id
  if (window.matchMedia?.('(max-width: 1100px)').matches) nextTick(() => detailEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
}

const levels = computed(() => ROOMS.reduce((n, r) => n + G.room(r.id), 0))
const maxLevels = ROOMS.reduce((n, r) => n + r.max, 0)
const built = computed(() => ROOMS.filter(r => G.room(r.id) > 0).length)
const bonuses = computed(() => (void state.trophies, Object.entries(G.homeTotals())))
const costList = cost => Object.entries(cost).filter(([, v]) => v > 0)
const roomCost = r => { const c = G.roomCost(r); return [['gold', c.gold], ...costList(c.items)] }
const costOk = (k, v) => (k === 'gold' ? state.gold >= v : G.qty(k) >= v)
const bossName = tr => resolveParams({ b: '@monster:' + tr.boss }).b
const roomName = id => ROOMS.find(r => r.id === id)?.name
const modsOf = tr => Object.entries(tr.mods).map(([k, v]) => modText(k, v)).join(' · ')

// Rooms whose next level is within reach, marked on the plan
const ready = computed(() => new Set(ROOMS.filter(r => G.canBuild(r)).map(r => r.id)))
const hangable = computed(() => new Set(TROPHIES.filter(tr => !G.hasTrophy(tr.id) && !G.trophyBlocker(tr)).map(tr => tr.id)))
const justHung = ref(null)

/* ---------- what the rooms make on their own ---------- */
const now = ref(Date.now())
let clock
onMounted(() => { G.ensureHomeWork(); clock = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => clearInterval(clock))
const work = computed(() => (void state.homeWork, PRODUCERS.map(p => ({ ...p, st: G.homeStored(p.room, now.value) }))))
const anyReady = computed(() => work.value.some(w => w.st?.qty >= 1))
const madeName = st => (st.item ? ITEMS[st.item].name : st.skill ? $tr('home.xpFor', { skill: SKILLS[st.skill].name }) : $tr('common.gold'))
const fullIn = st => fmtTime((HOME_STORE_HOURS - st.hours) * 3600)
function gained(st) {
  if (st.item) return $tr('gain.item', { n: fmt(st.qty), item: ITEMS[st.item].name })
  if (st.skill) return $tr('home.gainXp', { n: fmt(st.qty), skill: SKILLS[st.skill].name })
  return $tr('gain.gold', { n: fmt(st.qty) })
}
function collect(room) {
  const st = G.collectHome(room)
  if (!st) return
  play('quest')
  G.toast(ROOMS.find(r => r.id === room).icon, 'home.collected', { what: gained(st) }, 'success')
}
/* ---------- companions living in the house ---------- */
const PLACE_ORDER = { home: 0, nobed: 1, away: 2, party: 3 }
const guests = computed(() => (void now.value, [...state.company.members]
  .map(m => ({ m, place: G.companionPlace(m) }))
  .sort((a, b) => PLACE_ORDER[a.place] - PLACE_ORDER[b.place])))
const sleeping = computed(() => guests.value.filter(g => g.place === 'home').length)
const rates = computed(() => (void state.rooms, G.homeRates()))
const pct = v => +(v * 100).toFixed(1)
const hurtLeft = m => Math.max(0, ((m.hurtUntil || 0) - now.value) / 1000)

function collectAll() {
  const got = G.collectAllHome()
  if (!got.length) return
  play('quest')
  G.toast('family-house', 'home.collected', { what: got.map(gained).join(' · ') }, 'success')
}
// The wall: the realm's bosses first, then the lords of the dungeons
const realmBosses = new Set(BOSSES.map(b => b.id))
const GROUPS = [
  { id: 'realm', list: TROPHIES.filter(tr => realmBosses.has(tr.boss)) },
  { id: 'dungeon', list: TROPHIES.filter(tr => !realmBosses.has(tr.boss)) },
]

function build(r) {
  if (!G.build(r.id)) return
  play('quest')
  G.toast(r.icon, 'home.upgraded', { room: '@room:' + r.id, n: G.room(r.id) }, 'success')
}
function hang(tr) {
  if (!G.hangTrophy(tr.id)) return
  play('rare')
  justHung.value = tr.id
  setTimeout(() => { if (justHung.value === tr.id) justHung.value = null }, 1600)
  G.toast(tr.icon, 'home.hung', { trophy: '@trophy:' + tr.id, room: '@room:' + tr.room }, 'success')
}
function status(tr) {
  if (G.hasTrophy(tr.id)) return { cls: 'ok', text: 'home.trophyHung' }
  const b = G.trophyBlocker(tr)
  if (b === 'kills') return { cls: '', text: 'home.trophyKills' }
  if (b === 'room') return { cls: 'bad', text: 'home.trophyRoom' }
  if (b === 'cost') return { cls: 'bad', text: 'home.trophyCost' }
  return { cls: 'gold', text: 'home.trophyReady' }
}
</script>

<template>
  <div>
    <div class="banner" style="--c:#e2b65a">
      <GameIcon class="banner-ghost" name="family-house" :size="230" />
      <ItemTile icon="family-house" tint="#8a6a2a" size="xl" :tip="false" />
      <div class="grow">
        <h1 class="banner-title">{{ $t('home.title') }}</h1>
        <div class="banner-desc">{{ $t('home.intro') }}</div>
        <div class="row wrap">
          <span class="tag gold">{{ $t('home.houseLevel', { n: levels, max: maxLevels }) }}</span>
          <span class="tag">{{ $t('home.roomsBuilt', { n: built, max: ROOMS.length }) }}</span>
          <span class="tag arcane"><GameIcon name="trophy-cup" :size="12" /> {{ $t('home.trophiesHung', { n: G.trophiesHung(), max: TROPHIES.length }) }}</span>
        </div>
        <div class="bar thin" style="margin-top:12px;max-width:420px"><i :style="{ width: (levels / maxLevels) * 100 + '%' }" /></div>
      </div>
      <div class="panel pad sum-card">
        <b>{{ $t('home.wallBonus') }}</b>
        <div v-if="bonuses.length" class="sum-list">
          <span v-for="[k, v] in bonuses" :key="k" class="tag ok">{{ modText(k, v) }}</span>
        </div>
        <div v-else class="small muted">{{ $t('home.wallEmpty') }}</div>
      </div>
    </div>

    <div class="home-grid">
      <div class="panel pad">
        <h3 class="panel-title"><GameIcon name="house" /> {{ $t('home.planTitle') }} <HelpTip k="sections.home" /></h3>
        <div class="plan">
          <button v-for="r in ROOMS" :key="r.id" type="button" class="room-tile"
            :class="{ built: G.room(r.id) > 0, max: G.room(r.id) >= r.max, on: picked === r.id }"
            :aria-pressed="picked === r.id" @click="pick(r.id)">
            <span v-if="ready.has(r.id)" class="dot" v-tooltip.top="$t('home.canUpgrade')" />
            <ItemTile :icon="r.icon" :tint="G.room(r.id) ? '#8a6a2a' : '#4a4a55'" :size="small ? 'md' : 'lg'" :tip="false" />
            <span class="room-name">{{ r.name }}</span>
            <span class="pips"><i v-for="i in r.max" :key="i" :class="{ on: i <= G.room(r.id) }" /></span>
            <span class="slots">
              <i v-for="tr in trophiesIn(r.id)" :key="tr.id" class="slot" :class="{ hung: G.hasTrophy(tr.id), fresh: justHung === tr.id }"
                :style="{ '--t': tr.tint }" v-tooltip.top="tr.name">
                <GameIcon :name="G.hasTrophy(tr.id) ? tr.icon : 'trophy-cup'" :size="13" />
              </i>
            </span>
          </button>
        </div>
      </div>

      <div ref="detailEl" class="panel pad detail" :key="room.id">
        <div class="row">
          <ItemTile :icon="room.icon" tint="#8a6a2a" size="lg" :tip="false" />
          <div class="grow">
            <h3 class="detail-name">{{ room.name }}</h3>
            <div class="card-sub">{{ $t('home.level', { n: G.room(room.id), max: room.max }) }}</div>
          </div>
          <span v-if="G.room(room.id) >= room.max" class="tag ok"><i class="pi pi-check" /> {{ $t('common.maxLevel') }}</span>
        </div>
        <div class="pips big"><i v-for="i in room.max" :key="i" :class="{ on: i <= G.room(room.id) }" /></div>
        <div class="effects">
          <div class="eff">
            <span class="eff-k">{{ $t('home.now') }}</span>
            <span v-if="G.room(room.id)">{{ room.desc(G.room(room.id)) }}</span>
            <span v-else class="muted">{{ $t('home.notBuilt') }}</span>
          </div>
          <div v-if="G.room(room.id) < room.max" class="eff next">
            <span class="eff-k">{{ $t('home.nextShort') }}</span>
            <span>{{ room.desc(G.room(room.id) + 1) }}</span>
          </div>
        </div>
        <template v-if="G.room(room.id) < room.max">
          <div class="cost-box">
            <div v-for="[k, v] in roomCost(room)" :key="k" class="row small">
              <ItemTile v-if="k !== 'gold'" :item="k" size="xs" />
              <ItemTile v-else icon="two-coins" tint="#c9a04a" size="xs" :tip="false" />
              <span class="grow">{{ k === 'gold' ? $t('common.gold') : ITEMS[k].name }}</span>
              <b class="tnum" :class="{ 'bad-text': !costOk(k, v) }">{{ fmt(k === 'gold' ? state.gold : G.qty(k)) }} / {{ fmt(v) }}</b>
            </div>
          </div>
          <Button :label="G.room(room.id) ? $t('home.upgrade') : $t('home.build')" icon="pi pi-hammer" fluid :disabled="!G.canBuild(room)" @click="build(room)" />
        </template>

        <div class="sub-title">{{ $t('home.roomTrophies') }}</div>
        <div v-if="!trophiesIn(room.id).length" class="small faint">{{ $t('home.noTrophies') }}</div>
        <div v-for="tr in trophiesIn(room.id)" :key="tr.id" class="mini" :class="{ hung: G.hasTrophy(tr.id) }">
          <ItemTile :icon="tr.icon" :tint="G.hasTrophy(tr.id) ? tr.tint : '#4a4a55'" size="sm" :tip="false" />
          <div class="grow">
            <div class="small"><b>{{ tr.name }}</b></div>
            <div class="small muted">{{ modsOf(tr) }}</div>
          </div>
          <Button v-if="hangable.has(tr.id)" :label="$t('home.hang')" size="small" @click="hang(tr)" />
          <span v-else class="tag" :class="status(tr).cls">{{ $t(status(tr).text, { n: G.trophyKills(tr), max: tr.kills, boss: bossName(tr), room: room.name }) }}</span>
        </div>
      </div>
    </div>

    <div class="panel pad work">
      <div class="row work-head">
        <h3 class="panel-title grow"><GameIcon name="hourglass" /> {{ $t('home.workTitle') }} <HelpTip k="sections.homeWork" :params="{ n: HOME_STORE_HOURS }" /></h3>
        <Button :label="$t('home.collectAll')" icon="pi pi-download" size="small" :disabled="!anyReady" @click="collectAll" />
      </div>
      <div class="work-grid">
        <div v-for="w in work" :key="w.room" class="job" :class="{ off: !w.st, full: w.st?.full }">
          <div class="row">
            <ItemTile :icon="w.icon" :tint="w.st ? '#8a6a2a' : '#4a4a55'" size="md" :tip="false" />
            <div class="grow">
              <div class="job-name">{{ roomName(w.room) }}</div>
              <div class="small muted">{{ $t('home.makes.' + w.room) }}</div>
            </div>
          </div>
          <template v-if="w.st">
            <div class="made">
              <ItemTile v-if="w.st.item" :item="w.st.item" size="sm" />
              <ItemTile v-else-if="w.st.skill" :icon="SKILLS[w.st.skill].icon" :tint="SKILLS[w.st.skill].color" size="sm" :tip="false" />
              <ItemTile v-else icon="two-coins" tint="#c9a04a" size="sm" :tip="false" />
              <div class="grow">
                <div class="small"><b>{{ madeName(w.st) }}</b></div>
                <div class="small faint">{{ $t('home.perHour', { n: fmt(w.st.perHour) }) }}</div>
              </div>
              <b class="tnum ready">{{ fmt(w.st.qty) }}</b>
            </div>
            <div class="bar" :style="{ '--c': w.st.full ? '#62c17e' : undefined }"><i :style="{ width: (w.st.hours / HOME_STORE_HOURS) * 100 + '%' }" /></div>
            <div class="small" :class="w.st.full ? 'ok-text' : 'faint'">{{ w.st.full ? $t('home.storeFull') : $t('home.fullIn', { time: fullIn(w.st) }) }}</div>
            <Button :label="$t('home.collect')" icon="pi pi-download" size="small" :severity="w.st.full ? undefined : 'secondary'" :disabled="w.st.qty < 1" @click="collect(w.room)" />
          </template>
          <div v-else class="small faint job-off">{{ G.room(w.room) ? $t('home.cannotMake') : $t('home.buildToMake', { room: roomName(w.room) }) }}</div>
        </div>
      </div>
    </div>

    <div class="panel pad guests">
      <div class="row wrap guests-head">
        <h3 class="panel-title grow"><GameIcon name="wood-cabin" /> {{ $t('home.guestsTitle') }} <HelpTip k="sections.homeGuests" /></h3>
        <span class="tag gold">{{ $t('home.beds', { n: sleeping, max: G.homeBeds() }) }}</span>
        <span class="tag" :class="{ ok: G.room('kitchen') }" v-tooltip.top="$t('home.rateTrustTip')"><GameIcon name="cooking-pot" :size="12" /> {{ $t('home.rateTrust', { n: rates.trust.toFixed(1) }) }}</span>
        <span class="tag" :class="{ ok: rates.drill }" v-tooltip.top="$t('home.rateDrillTip')"><GameIcon name="swords-emblem" :size="12" /> {{ rates.drill ? $t('home.rateDrill', { n: pct(rates.drill) }) : $t('home.noDrill') }}</span>
        <span class="tag" :class="{ ok: G.room('bedroom') }" v-tooltip.top="$t('home.rateRestTip')"><GameIcon name="wood-cabin" :size="12" /> {{ $t('home.rateRest', { n: rates.rest.toFixed(1) }) }}</span>
      </div>
      <p v-if="!guests.length" class="small muted guests-empty">{{ $t('home.noCompany') }}</p>
      <p v-else-if="!G.homeBeds()" class="small muted guests-empty">{{ $t('home.noBeds', { room: roomName('bedroom') }) }}</p>
      <div v-if="guests.length" class="guest-grid">
        <div v-for="g in guests" :key="g.m.id" class="guest" :class="'at-' + g.place" :style="{ '--t': mercTint(g.m) }">
          <div class="row">
            <ItemTile :icon="mercIcon(g.m)" :tint="mercTint(g.m)" size="md" :tip="false" />
            <div class="grow">
              <div class="guest-name">{{ mercName(g.m) }}</div>
              <div class="small muted">{{ $t(`company.roles.${g.m.role}.name`) }} · {{ $t('company.level', { n: g.m.lvl }) }}</div>
            </div>
          </div>
          <div class="row small">
            <span class="grow muted">{{ $t('home.trust') }}</span>
            <b class="tnum" :class="{ 'gold-text': (g.m.trust || 0) >= LOYAL_AT }">{{ g.m.trust || 0 }} / {{ TRUST_MAX }}</b>
          </div>
          <div class="bar thin" :style="{ '--c': mercTint(g.m) }"><i :style="{ width: ((g.m.trust || 0) / TRUST_MAX) * 100 + '%' }" /></div>
          <div v-if="g.place === 'home' && rates.drill" class="row small">
            <span class="grow muted">{{ $t('home.training') }}</span>
            <span class="tnum faint">{{ fmt(Math.floor(g.m.xp)) }} / {{ fmt(mercXpNeed(g.m.lvl)) }}</span>
          </div>
          <span class="tag place" :class="{ ok: g.place === 'home', bad: g.place === 'nobed', arcane: g.place === 'away' }">
            <template v-if="g.place === 'home' && G.mercHurt(g.m)"><i class="pi pi-heart" /> {{ $t('home.healing', { t: fmtClock(hurtLeft(g.m)) }) }}</template>
            <template v-else>{{ $t('home.place.' + g.place) }}</template>
          </span>
        </div>
      </div>
    </div>

    <div class="panel pad wall">
      <h3 class="panel-title"><GameIcon name="trophy-cup" /> {{ $t('home.wallTitle') }} <HelpTip k="sections.trophies" /></h3>
      <p class="small muted" style="margin-top:-6px">{{ $t('home.wallText') }}</p>
      <template v-for="g in GROUPS" :key="g.id">
        <div class="group-title"><span>{{ $t('home.group.' + g.id) }}</span><i /></div>
        <div class="trophies">
          <div v-for="tr in g.list" :key="tr.id" class="trophy" :style="{ '--t': tr.tint }"
            :class="{ hung: G.hasTrophy(tr.id), locked: G.trophyKills(tr) < tr.kills, fresh: justHung === tr.id }">
            <div class="plaque">
              <GameIcon :name="tr.icon" :size="44" />
            </div>
            <div class="t-body">
              <div class="t-name">{{ tr.name }}</div>
              <div class="small muted">{{ $t('home.trophyOf', { boss: bossName(tr), room: roomName(tr.room) }) }}</div>
              <div class="small t-desc">{{ tr.desc }}</div>
              <div class="tag ok t-mod">{{ modsOf(tr) }}</div>
            </div>
            <div class="t-foot">
              <template v-if="!G.hasTrophy(tr.id)">
                <div class="row small">
                  <span class="grow muted">{{ $t('home.kills', { boss: bossName(tr) }) }}</span>
                  <b class="tnum">{{ fmt(Math.min(G.trophyKills(tr), tr.kills)) }} / {{ tr.kills }}</b>
                </div>
                <div class="bar thin" :style="{ '--c': tr.tint }"><i :style="{ width: Math.min(1, G.trophyKills(tr) / tr.kills) * 100 + '%' }" /></div>
                <div class="t-cost">
                  <span v-for="[k, v] in costList(tr.cost)" :key="k" class="cost-i" :class="{ miss: !costOk(k, v) }" v-tooltip.top="k === 'gold' ? $t('common.gold') : ITEMS[k].name">
                    <ItemTile v-if="k !== 'gold'" :item="k" size="xs" /><GameIcon v-else name="two-coins" :size="16" />{{ fmt(v) }}
                  </span>
                </div>
                <Button v-if="hangable.has(tr.id)" :label="$t('home.hang')" icon="pi pi-star" size="small" fluid @click="hang(tr)" />
                <span v-else-if="G.trophyBlocker(tr) !== 'kills'" class="tag" :class="status(tr).cls">{{ $t(status(tr).text, { n: G.trophyKills(tr), max: tr.kills, boss: bossName(tr), room: roomName(tr.room) }) }}</span>
              <span v-else class="tag">{{ $t('home.trophyLocked') }}</span>
              </template>
              <span v-else class="tag ok"><i class="pi pi-check" /> {{ $t('home.trophyHung') }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sum-card { display: flex; flex-direction: column; gap: 8px; width: 300px; padding: 14px; }
.sum-list { display: flex; flex-wrap: wrap; gap: 6px; }

.home-grid { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(320px, 1fr); gap: 16px; margin-top: 18px; align-items: start; }

.plan { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.room-tile { all: unset; box-sizing: border-box; position: relative; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 14px 8px 12px; border-radius: 14px; border: 1px dashed var(--line); background: var(--well); text-align: center;
  transition: border-color 0.2s, box-shadow 0.2s, transform 0.2s, background 0.2s; }
.room-tile:not(.built) :deep(.tile) { opacity: 0.55; filter: grayscale(0.6); }
.room-tile.built { border-style: solid; border-color: rgba(226, 182, 90, 0.28);
  background: radial-gradient(circle at 50% 30%, rgba(226, 182, 90, 0.14), transparent 70%), var(--well); }
.room-tile.max { box-shadow: inset 0 0 0 1px rgba(98, 193, 126, 0.25); }
.room-tile:hover { transform: translateY(-2px); border-color: rgba(226, 182, 90, 0.5); }
.room-tile.on { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold), 0 0 18px rgba(226, 182, 90, 0.35); }
.room-tile:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.room-name { font-weight: 700; font-size: 13px; line-height: 1.2; min-height: 2.4em; display: flex; align-items: center; }
.room-tile:not(.built) .room-name { color: var(--muted); }
.dot { position: absolute; top: 8px; right: 8px; width: 9px; height: 9px; border-radius: 50%; background: var(--gold); box-shadow: 0 0 8px var(--gold); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.35; } }

.pips { display: flex; gap: 3px; width: 100%; }
.pips i { flex: 1; height: 4px; border-radius: 4px; background: var(--tint-3); }
.pips i.on { background: var(--gold-grad); box-shadow: 0 0 6px rgba(226, 182, 90, 0.5); }
.pips.big { margin: 12px 0 4px; }
.pips.big i { height: 6px; }

.slots { display: flex; gap: 4px; min-height: 22px; }
.slot { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; border: 1px dashed var(--line); color: var(--faint); }
.slot.hung { border-style: solid; border-color: color-mix(in srgb, var(--t) 60%, transparent); color: var(--t); background: color-mix(in srgb, var(--t) 14%, transparent); }
.slot.fresh, .trophy.fresh .plaque { animation: hung 1.4s ease-out; }
@keyframes hung { 0% { transform: scale(0.4); filter: brightness(2.2); } 45% { transform: scale(1.18); } 100% { transform: scale(1); filter: none; } }

.detail { display: flex; flex-direction: column; gap: 10px; position: sticky; top: 12px; animation: fade 0.25s ease-out; }
@keyframes fade { from { opacity: 0; transform: translateY(4px); } }
.detail-name { font-family: var(--font-display); font-size: 20px; margin: 0; letter-spacing: 0.03em; }
.effects { display: flex; flex-direction: column; gap: 6px; }
.eff { display: flex; gap: 10px; align-items: baseline; padding: 8px 10px; border-radius: 10px; background: var(--well); font-size: 13.5px; }
.eff.next { background: rgba(226, 182, 90, 0.07); }
.eff-k { flex: none; width: 74px; font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--faint); }
.cost-box { display: flex; flex-direction: column; gap: 6px; padding: 10px; border-radius: 10px; background: var(--well); }
.sub-title { margin-top: 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--faint); }
.mini { display: flex; align-items: center; gap: 10px; padding: 8px; border-radius: 10px; border: 1px solid var(--line); }
.mini.hung { border-color: rgba(98, 193, 126, 0.3); background: rgba(98, 193, 126, 0.05); }

.wall { margin-top: 16px; }
.work { margin-top: 16px; }
.guests { margin-top: 16px; }
.guests-head { gap: 8px; margin-bottom: 14px; }
.guests-head .panel-title { margin: 0; }
.guests-empty { margin: 0; padding: 14px; border-radius: 10px; background: var(--well); text-align: center; }
.guests-empty + .guest-grid { margin-top: 12px; }
.guest-grid { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.guest { flex: 1 1 220px; max-width: 300px; display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--well); }
.guest.at-home { border-color: color-mix(in srgb, var(--t) 50%, transparent);
  background: radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--t) 14%, transparent), transparent 60%), var(--well); }
.guest.at-party, .guest.at-away { opacity: 0.75; }
.guest-name { font-weight: 700; }
.guest .place { align-self: flex-start; margin-top: auto; }
.gold-text { color: var(--gold-hi); }
.work-head .panel-title { margin: 0; }
.work-head { margin-bottom: 14px; }
.work-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.job { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--well); }
.job.full { border-color: rgba(98, 193, 126, 0.4); box-shadow: 0 0 14px rgba(98, 193, 126, 0.12); }
.job.off { border-style: dashed; }
.job.off :deep(.tile) { opacity: 0.55; filter: grayscale(0.6); }
.job-name { font-weight: 700; }
.job-off { margin-top: auto; padding: 10px; border-radius: 10px; background: var(--tint-2); text-align: center; }
.made { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--tint-2); }
.ready { font-size: 20px; color: var(--gold-hi); }
.job > .p-button { margin-top: auto; }
.group-title { display: flex; align-items: center; gap: 12px; margin: 18px 0 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--gold-hi); }
.group-title i { flex: 1; height: 1px; background: linear-gradient(90deg, rgba(226, 182, 90, 0.35), transparent); }
.trophies { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; }
.trophy { flex: 1 1 220px; max-width: 260px; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--well); }
.trophy.hung { border-color: color-mix(in srgb, var(--t) 45%, transparent);
  background: radial-gradient(circle at 50% 0%, color-mix(in srgb, var(--t) 16%, transparent), transparent 65%), var(--well); }
.plaque { align-self: center; display: grid; place-items: center; width: 84px; height: 84px; border-radius: 50% 50% 14px 14px;
  border: 2px solid rgba(226, 182, 90, 0.35); background: linear-gradient(180deg, #5a3d22, #3a2614); color: var(--t);
  box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 4px 12px rgba(0, 0, 0, 0.3); }
.trophy.hung .plaque { border-color: var(--gold); box-shadow: inset 0 2px 6px rgba(0, 0, 0, 0.5), 0 0 18px color-mix(in srgb, var(--t) 45%, transparent); }
.trophy:not(.hung) .plaque { color: color-mix(in srgb, var(--t) 45%, #555); }
.trophy.locked .plaque { color: #2a2a30; filter: grayscale(1); opacity: 0.7; }
.t-body { display: flex; flex-direction: column; gap: 4px; text-align: center; align-items: center; }
.t-name { font-weight: 700; font-size: 15px; }
.trophy.locked .t-name { color: var(--muted); }
.t-desc { color: var(--ink-2); font-style: italic; }
.t-mod { margin-top: 2px; }
.t-foot { display: flex; flex-direction: column; gap: 8px; margin-top: auto; }
.t-foot > .tag { align-self: center; }
.t-cost { display: flex; flex-wrap: wrap; gap: 6px 12px; font-size: 13px; justify-content: center; }
.cost-i { display: inline-flex; align-items: center; gap: 5px; font-variant-numeric: tabular-nums; color: var(--ink-2); }
.cost-i .gi { color: var(--gold); }
.cost-i.miss { color: var(--danger); }

@media (max-width: 1280px) {
  .plan { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .work-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1100px) {
  .home-grid { grid-template-columns: 1fr; }
  .detail { position: static; }
}
@media (max-width: 900px) { .sum-card { width: 100%; order: 4; } }
@media (max-width: 600px) {
  .work-grid { grid-template-columns: 1fr; }
  .plan { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
  .room-tile { flex: 0 0 calc((100% - 16px) / 3); }
  .room-tile { padding: 10px 4px 8px; gap: 6px; min-width: 0; }
  .room-name { font-size: 12px; }
  .detail { scroll-margin-top: 70px; }
}
@media (prefers-reduced-motion: reduce) { .dot { animation: none; } }
</style>
