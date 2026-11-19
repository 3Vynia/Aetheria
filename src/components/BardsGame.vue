<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import Button from 'primevue/button'
import { G, state } from '../game/engine.js'
import { BARD_ROUNDS, BARD_TIME, BARD_PAYS } from '../game/data/tavern.js'
import { fmt } from '../game/format.js'
import { play } from '../game/sound.js'
import ItemTile from './ItemTile.vue'
import GameIcon from './GameIcon.vue'
import GameTable from './GameTable.vue'
import BetInput from './BetInput.vue'

// The bards' duel: the rival minstrel sings a line, the hero answers with one of three before the
// crowd grows restless, and the tavern scores both. Three verses, the higher score takes the pot
const bet = ref(Math.min(100, Math.max(10, G.maxBet())))
const game = computed(() => (void state.tavern.games, G.table('bards')))
const round = computed(() => game.value.round)
const playing = computed(() => G.tableOpen('bards'))
const turn = computed(() => round.value?.you.length || 0)
const verse = computed(() => round.value?.verses[Math.min(turn.value, BARD_ROUNDS - 1)])
const answers = computed(() => (playing.value ? round.value.order[turn.value] : []))
const yourTotal = computed(() => (round.value?.you || []).reduce((s, x) => s + x.pts, 0))
const rivalTotal = computed(() => (round.value?.rival || []).reduce((s, x) => s + x, 0))
// The last answer, shown with the crowd's verdict until the next verse
const last = computed(() => {
  const r = round.value
  if (!r?.you.length) return null
  const i = r.you.length - 1
  return { ...r.you[i], rival: r.rival[i], verse: r.verses[i] }
})

// The time to answer, counted down on screen
const left = ref(BARD_TIME)
let timer = 0
function tick() {
  left.value = Math.max(0, left.value - 0.1)
  if (left.value <= 0) answer(-1)
}
function clock() { clearInterval(timer); left.value = BARD_TIME; if (playing.value) timer = setInterval(tick, 100) }
watch([playing, turn], clock)
// Walking away from a duel, or coming back to one left half sung, gives up the verses still to sing
const forfeit = () => { while (G.tableOpen('bards')) G.bardsAnswer(-1) }
onMounted(() => { forfeit(); clock() })
onUnmounted(() => { clearInterval(timer); forfeit() })

function start() {
  G.tableClear('bards')
  if (!G.bardsStart(bet.value)) return G.toast('lyre', 'tavern.badBet', {}, 'warn')
  play('dice')
}
function answer(i) {
  if (!playing.value) return
  const r = G.bardsAnswer(i)
  if (!r) return
  const mine = r.you[r.you.length - 1]
  if (r.result) play(r.result.net > 0 ? 'coin' : r.result.net < 0 ? 'bad' : 'dice')
  else play(mine.roar ? 'rare' : mine.kind === 'good' ? 'coin' : mine.kind === 'off' ? 'bad' : 'dice')
}
</script>

<template>
  <GameTable icon="lyre" :title="$t('tavern.bards.title')" help="sections.bards" :stats="game">
    <template #badge><span class="tag">{{ $t('tavern.bards.badge', { x: BARD_PAYS }) }}</span></template>
    <div class="stage">
      <!-- The two singers and the score -->
      <div class="singers">
        <div class="singer">
          <ItemTile icon="jester-hat" tint="#7a2a52" size="lg" :tip="false" />
          <b>{{ $t('tavern.bards.rival') }}</b>
          <span class="score tnum">{{ rivalTotal }}</span>
        </div>
        <div class="verses-done">
          <span v-for="i in BARD_ROUNDS" :key="i" class="pip" :class="{ on: i <= turn, now: playing && i === turn + 1 }" />
        </div>
        <div class="singer">
          <ItemTile :icon="state.avatar" :tint="state.tint || '#6a3fbf'" size="lg" :tip="false" />
          <b>{{ state.name }}</b>
          <span class="score tnum">{{ yourTotal }}</span>
        </div>
      </div>

      <!-- The rival's line, then the hero's answers -->
      <template v-if="playing">
        <div :key="'v' + turn" class="bubble pop">
          <GameIcon name="lyre" :size="18" />
          <p>{{ $t(`tavern.bards.verses.${verse}.rival`) }}</p>
        </div>
        <div class="timer" :class="{ low: left < 4 }"><i :style="{ width: (left / BARD_TIME) * 100 + '%' }" /></div>
        <div class="answers" role="group" :aria-label="$t('tavern.bards.answers')">
          <button v-for="(kind, i) in answers" :key="turn + '-' + i" type="button" class="answer" @click="answer(i)">
            <span class="num">{{ i + 1 }}</span>
            <span>{{ $t(`tavern.bards.verses.${verse}.${kind}`) }}</span>
          </button>
        </div>
      </template>

      <!-- The crowd's verdict on the last verse -->
      <div v-if="last" :key="'c' + turn" class="verdict pop" :class="last.roar ? 'roar' : last.kind">
        <GameIcon :name="last.kind === 'off' ? 'shouting' : 'cheerful'" :size="22" />
        <div class="grow">
          <b>{{ $t('tavern.bards.crowd.' + (last.roar ? 'roar' : last.kind)) }}</b>
          <div class="small muted">{{ $t('tavern.bards.points', { you: last.pts, rival: last.rival }) }}</div>
        </div>
      </div>
      <p v-if="!playing && !round" class="small muted idle">{{ $t('tavern.bards.idle') }}</p>

      <div v-if="round?.result" :key="'r' + game.played" class="banner-result pop" :class="round.result.net > 0 ? 'win' : round.result.net < 0 ? 'loss' : 'even'" role="status">
        <b>{{ $t('tavern.bards.results.' + round.result.kind, { you: round.result.you, rival: round.result.rival }) }}</b>
        <span class="tnum">{{ $t('inventory.goldAmount', { n: (round.result.net > 0 ? '+' : '') + fmt(round.result.net) }) }}</span>
      </div>
    </div>

    <template #controls>
      <template v-if="playing">
        <div class="small muted">{{ $t('tavern.bards.verseOf', { n: turn + 1, of: BARD_ROUNDS }) }}</div>
        <div class="small faint">{{ $t('tavern.bards.hint') }}</div>
      </template>
      <template v-else>
        <BetInput v-model="bet" id="bards-bet" />
        <Button :label="$t('tavern.bards.start')" icon="pi pi-megaphone" fluid @click="start" />
      </template>
      <div class="rules small">
        <div class="rule"><span>{{ $t('tavern.bards.crowd.good') }}</span><b>2</b></div>
        <div class="rule"><span>{{ $t('tavern.bards.crowd.flat') }}</span><b>1</b></div>
        <div class="rule"><span>{{ $t('tavern.bards.crowd.off') }}</span><b>0</b></div>
      </div>
    </template>
  </GameTable>
</template>

<style scoped>
.stage { display: flex; flex-direction: column; gap: 14px; }
.singers { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 12px; }
.singer { display: grid; justify-items: center; gap: 4px; text-align: center; }
.singer b { font-size: 13.5px; }
.score { font-family: var(--font-display); font-size: 28px; color: var(--gold-hi); line-height: 1; }
.verses-done { display: flex; gap: 8px; }
.pip { width: 14px; height: 14px; border-radius: 50%; border: 2px solid var(--line-hi); }
.pip.on { background: var(--gold); border-color: var(--gold); }
.pip.now { border-color: var(--gold); box-shadow: 0 0 10px var(--gold); }
.bubble { position: relative; display: flex; gap: 10px; align-items: flex-start; padding: 14px 18px; border-radius: 16px; background: #f2e6c8; color: #3a2410;
  box-shadow: 0 6px 16px -6px rgba(0, 0, 0, 0.6); font-family: var(--font-display); font-size: 17px; }
.bubble p { margin: 0; line-height: 1.35; }
.bubble::before { content: ''; position: absolute; left: 34px; top: -10px; border: 10px solid transparent; border-top: 0; border-bottom-color: #f2e6c8; }
.timer { height: 6px; border-radius: 6px; background: var(--panel-solid); overflow: hidden; }
.timer i { display: block; height: 100%; background: var(--gold); transition: width 0.1s linear; }
.timer.low i { background: var(--danger); }
.answers { display: grid; gap: 8px; }
.answer { display: flex; gap: 12px; align-items: center; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--line-hi); background: var(--panel-solid);
  color: var(--ink); font: inherit; font-size: 15px; text-align: start; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
.answer:hover { border-color: var(--gold); transform: translateX(3px); }
.answer:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
.num { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--tint-2); font-weight: 800; font-size: 12px; color: var(--gold-hi); }
.verdict { display: flex; gap: 12px; align-items: center; padding: 10px 14px; border-radius: 12px; background: var(--panel-solid); border: 1px solid var(--line); }
.verdict.good, .verdict.roar { border-color: color-mix(in srgb, var(--ok) 50%, transparent); color: var(--tag-ok); }
.verdict.roar { box-shadow: 0 0 18px -6px var(--gold); color: var(--gold-hi); border-color: var(--gold); }
.verdict.off { border-color: color-mix(in srgb, var(--danger) 50%, transparent); color: var(--tag-bad); }
.idle { text-align: center; margin: 0; }
.rules { display: grid; gap: 4px; }
.rule { display: flex; justify-content: space-between; padding: 4px 10px; border-radius: 8px; background: var(--panel-solid); border: 1px solid var(--line); }
.rule b { color: var(--gold-hi); }
.banner-result { align-self: center; display: grid; justify-items: center; gap: 2px; padding: 10px 22px; border-radius: 12px; background: var(--panel-solid); border: 1px solid var(--line-hi); }
.banner-result b { font-family: var(--font-display); font-size: 19px; }
.banner-result.win { border-color: color-mix(in srgb, var(--ok) 55%, transparent); color: var(--tag-ok); }
.banner-result.loss { border-color: color-mix(in srgb, var(--danger) 55%, transparent); color: var(--tag-bad); }
.banner-result.even { color: var(--muted); }
:root[data-theme="light"] .banner-result.win, :root[data-theme="light"] .verdict.good { color: var(--ok); }
:root[data-theme="light"] .banner-result.loss, :root[data-theme="light"] .verdict.off { color: var(--danger); }
.pop { animation: pop 0.35s cubic-bezier(0.2, 0.8, 0.3, 1.3); }
@keyframes pop { 0% { opacity: 0; transform: translateY(6px) scale(0.96); } 100% { opacity: 1; transform: none; } }
@media (max-width: 600px) { .bubble { font-size: 15px; } .answer { font-size: 14px; } }
@media (prefers-reduced-motion: reduce) { .pop { animation: none; } .answer { transition: none; } }
</style>
