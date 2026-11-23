<script setup>
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import Slider from 'primevue/slider'
import SelectButton from 'primevue/selectbutton'
import { useConfirm } from 'primevue/useconfirm'
import { G, state } from '../game/engine.js'
import { PALETTES, PROFILE_IDS } from '../game/data/audio.js'
import { nowPlaying, previewTheme, stopPreview, skipTheme } from '../game/music.js'
import { play } from '../game/sound.js'
import { speak, VOICE_SPEEDS } from '../game/voices.js'
import { applyProfile, saveCustomProfile, matchingProfile, resetAudio } from '../game/audioProfiles.js'
import GameIcon from './GameIcon.vue'
import SoundStage from './SoundStage.vue'

const { t } = useI18n()
const confirm = useConfirm()
const st = state.settings

/* ---------- profiles ---------- */
const PROFILE_ICONS = { classic: 'laurel-crown', night: 'night-sleep', focus: 'all-seeing-eye', alerts: 'scroll-unfurled', cinematic: 'crown', minimal: 'feather', custom: 'quill-ink' }
const active = computed(() => (void JSON.stringify(st), matchingProfile()))
function useProfile(id) { if (applyProfile(id)) G.toast(PROFILE_ICONS[id] || 'sparkles', 'audio.profileApplied', { name: t(`audio.profiles.${id}.name`) }, 'success') }
function saveMine() { saveCustomProfile(); G.toast('quill-ink', 'audio.profileSaved', {}, 'success') }

// The music details are folded away; whether they are open is remembered on this device
const MORE = 'aetheria-audio-more'
const more = ref((() => { try { return localStorage.getItem(MORE) === '1' } catch { return false } })())
function toggleMore() { more.value = !more.value; try { localStorage.setItem(MORE, more.value ? '1' : '') } catch { /* storage unavailable */ } }

/* ---------- mixer ---------- */
const channels = [
  { on: 'music', vol: 'musicVol', label: 'settings.music', hint: 'settings.musicHint' },
  { on: 'ambience', vol: 'ambienceVol', label: 'settings.ambience', hint: 'settings.ambienceHint' },
  { on: 'sound', vol: 'sfxVol', label: 'settings.sound', hint: 'settings.soundHint' },
  { on: 'voices', vol: 'voiceVol', label: 'settings.voices', hint: 'settings.voicesHint' },
]
function setChannel(c, v) {
  st[c.on] = v
  if (v && c.on === 'sound') play('coin')
  // A few words from the tavern keeper, to hear the voices come back
  if (v && c.on === 'voices') speak(t('audio.voiceSample'), 'keeper')
}

// How fast the characters read; a few words let the player hear the new pace
const voiceSpeeds = computed(() => Object.keys(VOICE_SPEEDS).map(v => ({ value: v, label: t(`audio.voiceSpeeds.${v}`) })))
function setVoiceSpeed(v) { st.voiceSpeed = v; speak(t('audio.voiceSample'), 'keeper') }

/* ---------- music ---------- */
// Each theme's icon and its two colours, which tint its card and the stage while it plays
const LOOK = {
  calm: ['candle-light', '#e2b65a', '#6f5cd2'], voyage: ['compass', '#d9a35b', '#3f8f9a'], adventure: ['pine-tree', '#7fb069', '#e2b65a'],
  dark: ['mushroom', '#5a4a8a', '#2e6b5a'], cold: ['ice-spell-cast', '#8fd0f2', '#6f7fd2'], frozen: ['ice-golem', '#9fe0ff', '#4a6fbf'],
  ominous: ['crowned-skull', '#8a2a52', '#3a2a6a'], celestial: ['sun', '#ffe08a', '#a98bff'], dragon: ['dragon-breath', '#e0602a', '#8a2a2a'],
  dungeon: ['locked-chest', '#6a5a4a', '#3a3a5a'], tower: ['stone-tower', '#c9a04a', '#5a6a9a'], boss: ['dragon-head', '#c0392b', '#5a1a3a'],
  town: ['beer-horn', '#e2b65a', '#c9853a'], tavern: ['beer-horn', '#c9853a', '#8a4a2a'], market: ['two-coins', '#e2c35a', '#5aa87a'],
  guild: ['swords-emblem', '#b8862e', '#5a3a8a'], hearth: ['family-house', '#e8a65a', '#a8462a'], chapel: ['church', '#f1e3b0', '#8a9ad8'],
  festival: ['laurel-crown', '#f2b233', '#e8435a'], labour: ['mining', '#c9a36b', '#5a7a4a'], workshop: ['anvil-impact', '#e07a3a', '#6a6a7a'],
  farm: ['wheat', '#c9b84a', '#6aa84a'], waters: ['fishing-pole', '#5fa8d3', '#3a6aa8'], stealth: ['hood', '#4a4a6a', '#2a5a5a'],
  hero: ['crossed-swords', '#e2b65a', '#4a6fbf'], chronicle: ['quill-ink', '#c9b27a', '#6a4a8a'], library: ['bookshelf', '#a8865a', '#4a6a8a'],
  playful: ['paw-print', '#f2a65a', '#5ab8a8'], starlight: ['crystal-ball', '#a98bff', '#4ad0e0'], rebirth: ['ankh', '#f1e3b0', '#7a5ad8'],
  dawn: ['sun', '#ffcf8a', '#8ab8e8'], dusk: ['sun', '#e8845a', '#5a3a8a'], meadowsong: ['wheat', '#b8d86a', '#e2c35a'],
  rainfall: ['family-house', '#6a8aa8', '#3a4a6a'], lantern: ['candle-light', '#f2b25a', '#8a4a3a'], pilgrim: ['church', '#c9b27a', '#4a5a8a'],
  riverbend: ['fishing-pole', '#6ac8c8', '#4a8a5a'], highlands: ['pine-tree', '#6a9a6a', '#8a8ab8'], orchard: ['wheat', '#e8a65a', '#7ab85a'],
  embers: ['candle-light', '#e0602a', '#4a2a2a'], moonlit: ['crystal-ball', '#c8d8ff', '#3a3a7a'], sails: ['compass', '#5fa8d3', '#f1e3b0'],
  caravan: ['two-coins', '#d9a35b', '#a8462a'], cloister: ['church', '#e8dcb0', '#6a5a8a'], frostfire: ['ice-spell-cast', '#8fd0f2', '#e0602a'],
  wanderer: ['compass', '#a8865a', '#4a6a8a'], lullaby: ['family-house', '#f2c8d8', '#8a9ad8'], harvestmoon: ['wheat', '#f2b233', '#8a3a2a'],
  starfall: ['crystal-ball', '#ffe08a', '#4a3a9a'], oldroad: ['beer-horn', '#c9a36b', '#5a6a4a'],
}
const THEME_ICONS = Object.fromEntries(Object.entries(LOOK).map(([k, v]) => [k, v[0]]))
const colorsOf = id => (LOOK[id] || LOOK.calm).slice(1)
// The library of themes, by where they are heard
const GROUPS = [
  { id: 'road', themes: ['dawn', 'meadowsong', 'riverbend', 'orchard', 'sails', 'highlands', 'oldroad', 'wanderer', 'caravan', 'pilgrim', 'lantern', 'harvestmoon', 'frostfire'] },
  { id: 'night', themes: ['dusk', 'embers', 'rainfall', 'moonlit', 'starfall', 'cloister', 'lullaby'] },
  { id: 'realm', themes: ['calm', 'voyage', 'adventure', 'dark', 'cold', 'frozen', 'ominous', 'celestial', 'dragon', 'dungeon', 'tower', 'boss'] },
  { id: 'town', themes: ['town', 'tavern', 'market', 'guild', 'hearth', 'chapel', 'festival'] },
  { id: 'work', themes: ['labour', 'workshop', 'farm', 'waters', 'stealth'] },
  { id: 'story', themes: ['hero', 'chronicle', 'library', 'playful', 'starlight', 'rebirth'] },
]
const listening = computed(() => !!nowPlaying.preview)
function toggleListen() { if (nowPlaying.preview) stopPreview(); else previewTheme(nowPlaying.theme, 30) }
const modes = computed(() => [{ value: 'auto', label: t('audio.mode.auto') }, { value: 'locked', label: t('audio.mode.locked') }])
const palettes = computed(() => PALETTES.map(p => ({ value: p, label: t(`audio.palettes.${p}.name`) })))
function pickTheme(id) {
  if (st.musicMode === 'locked') st.musicTheme = id
  previewTheme(id)
}
function lockCurrent() { st.musicTheme = nowPlaying.theme; st.musicMode = 'locked' }
const why = computed(() => {
  if (nowPlaying.reason === 'preview') return t('audio.why.preview')
  if (nowPlaying.reason === 'locked') return t('audio.why.locked')
  return nowPlaying.next ? t('audio.why.shuffle', { next: t(`audio.themes.${nowPlaying.next}`) }) : t('audio.mode.autoHint')
})
function reset() {
  confirm.require({
    header: t('audio.resetTitle'), message: t('audio.resetMessage'), icon: 'pi pi-refresh',
    acceptLabel: t('audio.reset'), rejectLabel: t('common.cancel'), rejectProps: { severity: 'secondary', outlined: true },
    accept: () => { resetAudio(); G.toast('gears', 'audio.resetDone', {}, 'success') },
  })
}
</script>

<template>
  <div class="stack">
    <!-- The stage: what is playing, drawn as it sounds -->
    <section class="stage" :style="{ '--a': colorsOf(nowPlaying.theme)[0], '--b': colorsOf(nowPlaying.theme)[1] }">
      <SoundStage :colors="colorsOf(nowPlaying.theme)" :active="st.music !== false || listening" />
      <div class="stage-body">
        <div class="stage-kicker">{{ $t('audio.nowPlaying') }}</div>
        <h2 class="stage-title">{{ $t(`audio.themes.${nowPlaying.theme}`) }}</h2>
        <div class="stage-why">{{ why }}</div>
        <div class="stage-intensity" :aria-label="$t('audio.intensity', { n: nowPlaying.intensity })" v-tooltip.top="$t('audio.intensityTip')">
          <i v-for="n in 4" :key="n" :class="{ on: n - 1 <= nowPlaying.intensity }" />
        </div>
        <div class="stage-controls">
          <button class="listen" :class="{ on: listening }" :aria-label="$t(listening ? 'audio.stopPreview' : 'audio.listen')" @click="toggleListen">
            <i class="pi" :class="listening ? 'pi-pause' : 'pi-play'" />
          </button>
          <div class="mode-pill" role="radiogroup">
            <button v-for="m in modes" :key="m.value" role="radio" :aria-checked="st.musicMode === m.value" :class="{ on: st.musicMode === m.value }" @click="st.musicMode = m.value">{{ m.label }}</button>
          </div>
          <button class="ghost" :aria-label="$t('audio.skip')" v-tooltip.top="$t('audio.skip')" @click="skipTheme"><i class="pi pi-step-forward" /></button>
          <button v-if="st.musicMode === 'auto'" class="ghost" @click="lockCurrent"><i class="pi pi-lock" /> {{ $t('audio.keepThis') }}</button>
        </div>
        <p class="stage-hint">{{ $t(st.musicMode === 'locked' ? 'audio.mode.lockedHint' : 'audio.mode.autoHint') }}</p>
      </div>
    </section>

    <!-- The library of themes -->
    <section class="panel pad">
      <h3 class="panel-title"><GameIcon name="crystal-ball" /> {{ $t('audio.themesTitle') }}</h3>
      <p class="small muted" style="margin-top:0">{{ $t(st.musicMode === 'locked' ? 'audio.themesLocked' : 'audio.themesIntro') }}</p>
      <div v-for="g in GROUPS" :key="g.id" class="theme-group">
        <div class="group-name">{{ $t('audio.groups.' + g.id) }}</div>
        <div class="cards">
          <button v-for="id in g.themes" :key="id" class="card-theme"
            :class="{ playing: nowPlaying.theme === id, chosen: st.musicMode === 'locked' && st.musicTheme === id }"
            :style="{ '--a': colorsOf(id)[0], '--b': colorsOf(id)[1] }" @click="pickTheme(id)">
            <span class="card-glow" />
            <GameIcon :name="THEME_ICONS[id]" :size="22" />
            <span class="card-name">{{ $t(`audio.themes.${id}`) }}</span>
            <span v-if="nowPlaying.theme === id" class="eq" aria-hidden="true"><i /><i /><i /><i /></span>
            <i v-else class="pi pi-play card-play" />
          </button>
        </div>
      </div>
    </section>

    <!-- Mixer -->
    <div class="panel pad">
      <h3 class="panel-title"><i class="pi pi-sliders-h" style="color:var(--gold)" /> {{ $t('audio.mixer') }}</h3>
      <div class="vol">
        <span class="grow">{{ $t('settings.masterVol') }}</span>
        <Slider v-model="st.masterVol" :min="0" :max="100" :disabled="st.muted" class="vol-slider" :aria-label="$t('settings.masterVol')" />
        <span class="tnum small muted vol-n">{{ st.masterVol }}</span>
      </div>
      <div v-for="c in channels" :key="c.on" class="vol">
        <ToggleSwitch :inputId="'pref-' + c.on" :modelValue="st[c.on]" @update:modelValue="v => setChannel(c, v)" />
        <label class="grow" :for="'pref-' + c.on">{{ $t(c.label) }}<span class="small faint block">{{ $t(c.hint) }}</span></label>
        <Slider v-model="st[c.vol]" :min="0" :max="100" :disabled="!st[c.on] || st.muted" class="vol-slider" :aria-label="$t(c.label)" />
        <span class="tnum small muted vol-n">{{ st[c.vol] }}</span>
      </div>
      <div class="pref">
        <span class="grow">{{ $t('audio.voiceSpeed') }}<span class="small faint block">{{ $t('audio.voiceSpeedHint') }}</span></span>
        <SelectButton :modelValue="st.voiceSpeed || 'normal'" :options="voiceSpeeds" optionLabel="label" optionValue="value" :allowEmpty="false" :disabled="st.voices === false" :aria-label="$t('audio.voiceSpeed')" @update:modelValue="setVoiceSpeed" />
      </div>
      <label class="pref" for="pref-hidden"><span class="grow">{{ $t('settings.muteHidden') }}<span class="small faint block">{{ $t('audio.muteHiddenHint') }}</span></span><ToggleSwitch v-model="st.muteHidden" inputId="pref-hidden" /></label>
      <label class="pref" for="pref-muted"><span class="grow">{{ $t('settings.muteAll') }}</span><ToggleSwitch v-model="st.muted" inputId="pref-muted" /></label>
      <label class="pref" for="pref-area"><span class="grow">{{ $t('audio.areaAmbience') }}<span class="small faint block">{{ $t('audio.areaAmbienceHint') }}</span></span><ToggleSwitch v-model="st.areaAmbience" inputId="pref-area" /></label>
    </div>

    <!-- Profiles -->
    <div class="panel pad">
      <h3 class="panel-title"><GameIcon name="sparkles" /> {{ $t('audio.profilesTitle') }}</h3>
      <p class="small muted" style="margin-top:0">{{ $t('audio.profilesIntro') }}</p>
      <div class="profiles">
        <button v-for="id in [...PROFILE_IDS, ...(st.customProfile ? ['custom'] : [])]" :key="id" class="profile" :class="{ on: active === id }" @click="useProfile(id)">
          <GameIcon :name="PROFILE_ICONS[id]" :size="18" />
          <b>{{ $t(`audio.profiles.${id}.name`) }}</b>
          <span class="small muted">{{ $t(`audio.profiles.${id}.desc`) }}</span>
        </button>
      </div>
      <div class="row wrap" style="margin-top:12px;gap:8px">
        <span class="small muted grow">{{ active ? $t('audio.profileNow', { name: $t(`audio.profiles.${active}.name`) }) : $t('audio.profileEdited') }}</span>
        <Button :label="$t('audio.saveMine')" icon="pi pi-save" size="small" severity="secondary" outlined @click="saveMine" />
        <Button :label="$t('audio.reset')" icon="pi pi-refresh" size="small" severity="secondary" text @click="reset" />
      </div>
    </div>

    <!-- The rest of the music settings stay folded until asked for -->
    <button class="fold" :aria-expanded="more" @click="toggleMore">
      <GameIcon name="magic-swirl" :size="16" />
      <span class="grow"><b>{{ $t('audio.moreTitle') }}</b><span class="small muted block">{{ $t('audio.moreHint') }}</span></span>
      <i class="pi" :class="more ? 'pi-angle-up' : 'pi-angle-down'" />
    </button>
    <div v-show="more" class="stack">
    <!-- How the music sounds -->
    <div class="panel pad">
      <h3 class="panel-title"><GameIcon name="magic-swirl" /> {{ $t('audio.styleTitle') }}</h3>
      <div class="stack" style="gap:14px">
        <div>
          <div class="small muted" style="margin-bottom:6px">{{ $t('audio.palette') }}</div>
          <SelectButton v-model="st.palette" :options="palettes" optionLabel="label" optionValue="value" :allowEmpty="false" size="small" @update:modelValue="previewTheme(nowPlaying.theme, 10)" />
          <div class="small faint" style="margin-top:6px">{{ $t(`audio.palettes.${st.palette}.desc`) }}</div>
        </div>
        <div>
          <div class="row small"><span class="muted grow">{{ $t('audio.tempo') }}</span><b class="tnum">{{ st.tempo }}%</b></div>
          <Slider v-model="st.tempo" :min="60" :max="140" :step="5" :aria-label="$t('audio.tempo')" />
        </div>
        <div>
          <div class="row small"><span class="muted grow">{{ $t('audio.density') }}</span><b class="tnum">{{ st.density }}%</b></div>
          <Slider v-model="st.density" :min="0" :max="100" :step="5" :aria-label="$t('audio.density')" />
          <div class="small faint" style="margin-top:6px">{{ $t('audio.densityHint') }}</div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
/* The stage */
.stage { position: relative; min-height: 340px; border-radius: 22px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--a) 35%, transparent);
  box-shadow: 0 30px 60px -30px color-mix(in srgb, var(--a) 50%, #000), inset 0 0 0 1px rgba(255, 255, 255, 0.04); display: flex; align-items: flex-end; }
.stage-body { position: relative; z-index: 1; width: 100%; padding: 28px 28px 22px; background: linear-gradient(180deg, transparent, rgba(5, 4, 10, 0.75) 60%); color: #f4eee2; }
.stage-kicker { font-size: 11px; letter-spacing: 0.22em; text-transform: uppercase; color: rgba(244, 238, 226, 0.6); }
.stage-title { margin: 4px 0 2px; font-family: var(--font-display); font-weight: 400; font-size: clamp(30px, 5vw, 46px); letter-spacing: 0.03em; line-height: 1.05;
  background: linear-gradient(90deg, #fff, color-mix(in srgb, var(--a) 70%, #fff)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.stage-why { font-size: 13.5px; color: rgba(244, 238, 226, 0.7); }
.stage-intensity { display: flex; gap: 5px; margin: 12px 0 16px; width: max-content; }
.stage-intensity i { width: 22px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.15); transition: background 0.4s; }
.stage-intensity i.on { background: linear-gradient(90deg, var(--a), var(--b)); box-shadow: 0 0 10px color-mix(in srgb, var(--a) 70%, transparent); }
.stage-controls { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.listen { width: 56px; height: 56px; border-radius: 50%; border: 0; cursor: pointer; display: grid; place-items: center; color: #12101a; font-size: 18px;
  background: linear-gradient(135deg, #fff, color-mix(in srgb, var(--a) 60%, #fff)); box-shadow: 0 10px 30px -8px color-mix(in srgb, var(--a) 80%, transparent); transition: transform 0.2s; }
.listen:hover { transform: scale(1.06); }
.listen.on { animation: breathe 2.4s ease-in-out infinite; }
@keyframes breathe { 50% { box-shadow: 0 0 0 10px color-mix(in srgb, var(--a) 18%, transparent), 0 10px 30px -8px color-mix(in srgb, var(--a) 80%, transparent); } }
.mode-pill { display: flex; padding: 4px; border-radius: 999px; background: rgba(255, 255, 255, 0.08); backdrop-filter: blur(10px); }
.mode-pill button { border: 0; background: none; color: rgba(244, 238, 226, 0.7); font: inherit; font-size: 13px; padding: 7px 16px; border-radius: 999px; cursor: pointer; }
.mode-pill button.on { background: rgba(255, 255, 255, 0.16); color: #fff; }
.ghost { border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.04); color: rgba(244, 238, 226, 0.85); font: inherit; font-size: 13px; padding: 8px 14px; border-radius: 999px; cursor: pointer; }
.ghost:hover { background: rgba(255, 255, 255, 0.1); }
.stage-hint { margin: 12px 0 0; font-size: 12.5px; color: rgba(244, 238, 226, 0.5); max-width: 60ch; }
.listen:focus-visible, .mode-pill button:focus-visible, .ghost:focus-visible, .card-theme:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }

/* The library */
.theme-group + .theme-group { margin-top: 16px; }
.group-name { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--faint); margin-bottom: 8px; }
.cards { display: flex; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 0 2px; padding: 2px 2px 8px; margin: 0 -2px;
  }
.card-theme { flex: 0 0 172px; scroll-snap-align: start; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: flex-start; gap: 18px; min-height: 104px; padding: 14px; border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08); color: #f4eee2; font: inherit; text-align: start; cursor: pointer;
  background: linear-gradient(145deg, color-mix(in srgb, var(--a) 38%, #0d0b16), color-mix(in srgb, var(--b) 45%, #0a0912)); transition: transform 0.2s, box-shadow 0.2s, border-color 0.2s; }
.card-glow { position: absolute; inset: -40% -20% auto auto; width: 120px; height: 120px; border-radius: 50%; background: radial-gradient(circle, color-mix(in srgb, var(--a) 60%, transparent), transparent 70%); opacity: 0.6; pointer-events: none; }
.card-theme .gi { position: relative; color: rgba(255, 255, 255, 0.9); filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4)); }
.card-name { position: relative; font-weight: 700; font-size: 14px; line-height: 1.2; }
.card-play { position: absolute; right: 12px; bottom: 12px; font-size: 11px; color: rgba(255, 255, 255, 0.55); opacity: 0; transition: opacity 0.2s; }
.card-theme:hover { transform: translateY(-3px); box-shadow: 0 14px 30px -14px color-mix(in srgb, var(--a) 70%, #000); }
.card-theme:hover .card-play { opacity: 1; }
.card-theme.playing { border-color: rgba(255, 255, 255, 0.45); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15), 0 14px 34px -14px color-mix(in srgb, var(--a) 90%, #000); }
.card-theme.chosen::after { content: ''; position: absolute; top: 10px; right: 10px; width: 8px; height: 8px; border-radius: 50%; background: #fff; box-shadow: 0 0 8px #fff; }
.eq { position: absolute; right: 12px; bottom: 12px; display: flex; align-items: flex-end; gap: 2px; height: 14px; }
.eq i { width: 3px; background: #fff; border-radius: 1px; animation: eq 0.9s ease-in-out infinite; }
.eq i:nth-child(2) { animation-delay: -0.3s; } .eq i:nth-child(3) { animation-delay: -0.6s; } .eq i:nth-child(4) { animation-delay: -0.15s; }
@keyframes eq { 0%, 100% { height: 3px; } 50% { height: 14px; } }
@media (prefers-reduced-motion: reduce) { .eq i, .listen.on { animation: none; } .card-theme { transition: none; } }
:root[data-motion='reduce'] .eq i, :root[data-motion='reduce'] .listen.on { animation: none; }
@media (max-width: 600px) { .stage { min-height: 300px; } .stage-body { padding: 20px 18px 18px; } .card-theme { flex-basis: 140px; } }
.fold { display: flex; align-items: center; gap: 12px; width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--line); background: var(--panel); color: inherit; font: inherit; text-align: start; cursor: pointer; }
.fold:hover { border-color: var(--line-hi); }
.fold .gi { color: var(--gold); }
.profiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; }
.profile { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 10px 12px; border-radius: 12px; cursor: pointer; text-align: start;
  border: 1px solid var(--line); background: var(--tint-1); color: inherit; font: inherit; }
.profile .gi { color: var(--muted); }
.profile:hover { border-color: var(--line-hi); }
.profile.on { border-color: var(--gold); background: rgba(226, 182, 90, 0.08); }
.profile.on .gi { color: var(--gold); }
.pref { display: flex; align-items: center; gap: 12px; padding: 8px 0; cursor: pointer; }
.vol { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
.vol label { cursor: pointer; }
.vol-slider { width: 130px; flex-shrink: 0; }
.vol-n { width: 26px; text-align: end; }
.block { display: block; }
@media (max-width: 520px) { .vol { flex-wrap: wrap; } .vol > .grow { flex: 1 1 calc(100% - 64px); } .vol-slider { width: auto; flex: 1 1 calc(100% - 60px); margin: 4px 8px 6px; } }
</style>
