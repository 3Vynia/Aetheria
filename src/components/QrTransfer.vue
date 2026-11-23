<script setup>
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { splitCode, collector } from '../game/qrCodes.js'
import { decodeAny, importErrorKey } from '../game/transfer.js'
import GameIcon from './GameIcon.vue'

/* Moving a game between devices with QR codes: `code` set shows it (send), empty reads one (receive).
   A game takes several codes; they play one after another for a camera, or go into one picture. */
const props = defineProps({
  visible: Boolean,
  code: { type: String, default: '' },
  name: { type: String, default: '' },
})
const emit = defineEmits(['update:visible', 'received'])
const { t } = useI18n()
const media = ref(null) // qrMedia.js, loaded with the window
const load = async () => (media.value ||= await import('../ui/qrMedia.js'))
const close = () => emit('update:visible', false)

/* ---------- sending ---------- */
const parts = computed(() => (props.code ? splitCode(props.code) : []))
const svgs = ref([])
const shown = ref(0)
const playing = ref(true)
const speed = ref(1) // codes per second steps: slow, normal, fast
const SPEEDS = [700, 380, 220]
let timer = null
function play() {
  clearInterval(timer)
  if (!playing.value || svgs.value.length < 2) return
  timer = setInterval(() => { shown.value = (shown.value + 1) % svgs.value.length }, SPEEDS[speed.value])
}
watch([playing, speed], play)
const step = d => { playing.value = false; shown.value = (shown.value + d + svgs.value.length) % svgs.value.length }
const busy = ref(false)
async function downloadPicture() {
  busy.value = true
  try {
    const m = await load()
    const blob = await m.sheetBlob(parts.value, `Aetheria · ${props.name}`, t('qr.sheetHint', { n: parts.value.length }))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `aetheria-qr-${(props.name || 'hero').toLowerCase().replace(/[^\w-]+/g, '-')}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  } finally { busy.value = false }
}

/* ---------- receiving ---------- */
const video = ref(null)
const cam = ref(null)
const camOn = ref(false)
const devices = ref([])
const progress = ref({ have: 0, n: 0, missing: [] })
const error = ref('')
let col = collector()
async function finish(state) {
  progress.value = state
  if (!state.done) return
  stopCamera()
  try {
    const save = await decodeAny(state.code)
    emit('received', save)
    close()
  } catch (e) {
    error.value = t(importErrorKey(e))
    col = collector()
    progress.value = col.state()
  }
}
async function startCamera() {
  error.value = ''
  if (!navigator.mediaDevices?.getUserMedia) { error.value = t('qr.noCamera'); return }
  try {
    const m = await load()
    camOn.value = true
    await nextTick()
    cam.value = await m.startCamera(video.value, text => finish(col.add(text)))
    devices.value = await cam.value.devices().catch(() => [])
  } catch (e) {
    camOn.value = false
    error.value = t(e?.name === 'NotAllowedError' ? 'qr.cameraDenied' : 'qr.noCamera')
  }
}
let deviceAt = 0
async function switchCamera() {
  if (devices.value.length < 2) return
  deviceAt = (deviceAt + 1) % devices.value.length
  await cam.value?.use(devices.value[deviceAt].deviceId).catch(() => {})
}
function stopCamera() { cam.value?.stop(); cam.value = null; camOn.value = false }
const fileInput = ref(null)
async function pictures(ev) {
  error.value = ''
  const files = [...(ev.target.files || [])]
  ev.target.value = ''
  if (!files.length) return
  busy.value = true
  try {
    const m = await load()
    let state = col.state()
    for (const f of files) state = await m.readPicture(f, col).catch(() => state)
    if (!state.have) error.value = t('qr.nothingFound')
    else if (!state.done) error.value = t('qr.someMissing', { have: state.have, n: state.n })
    await finish(state)
  } finally { busy.value = false }
}
const pct = computed(() => (progress.value.n ? Math.round((progress.value.have / progress.value.n) * 100) : 0))

/* ---------- opening and closing ---------- */
watch(() => props.visible, async v => {
  if (v) {
    error.value = ''
    col = collector()
    progress.value = col.state()
    if (props.code) {
      const m = await load()
      svgs.value = parts.value.map(m.qrSvg)
      shown.value = 0
      playing.value = true
      play()
    }
  } else { clearInterval(timer); stopCamera() }
}, { immediate: true })
onUnmounted(() => { clearInterval(timer); stopCamera() })
</script>

<template>
  <Dialog :visible="visible" modal class="qr-dialog" style="width: min(560px, calc(100vw - 24px))"
    :header="$t(code ? 'qr.sendTitle' : 'qr.receiveTitle')" @update:visible="v => v || close()">
    <!-- Sending: the codes play one after the other -->
    <div v-if="code" class="qr">
      <p class="small muted qr-intro">{{ $t('qr.sendIntro') }}</p>
      <div class="qr-stage">
        <div v-if="svgs.length" class="qr-code" v-html="svgs[shown]" />
        <div v-else class="qr-code qr-wait"><i class="pi pi-spin pi-spinner" /></div>
        <div class="qr-dots" :aria-label="$t('qr.partOf', { i: shown + 1, n: parts.length })">
          <span v-for="(p, i) in parts" :key="i" :class="{ on: i === shown }" />
        </div>
        <div class="small faint">{{ $t('qr.partOf', { i: shown + 1, n: parts.length }) }}</div>
      </div>
      <div class="qr-controls">
        <Button icon="pi pi-step-backward" text rounded :aria-label="$t('qr.prev')" @click="step(-1)" />
        <Button :icon="playing ? 'pi pi-pause' : 'pi pi-play'" rounded :aria-label="$t(playing ? 'qr.pause' : 'qr.play')" @click="playing = !playing" />
        <Button icon="pi pi-step-forward" text rounded :aria-label="$t('qr.next')" @click="step(1)" />
        <div class="qr-speed" role="group" :aria-label="$t('qr.speed')">
          <button v-for="(s, i) in ['slow', 'normal', 'fast']" :key="s" :class="{ on: speed === i }" @click="speed = i; playing = true">{{ $t('qr.speeds.' + s) }}</button>
        </div>
      </div>
      <div class="qr-alt">
        <GameIcon name="scroll-unfurled" :size="22" />
        <div class="grow">
          <b>{{ $t('qr.pictureTitle') }}</b>
          <div class="small muted">{{ $t('qr.pictureHint') }}</div>
        </div>
        <Button :label="$t('qr.download')" icon="pi pi-image" severity="secondary" :loading="busy" @click="downloadPicture" />
      </div>
    </div>

    <!-- Receiving: the camera, or pictures -->
    <div v-else class="qr">
      <p class="small muted qr-intro">{{ $t('qr.receiveIntro') }}</p>
      <div class="qr-cam" :class="{ on: camOn }">
        <video v-show="camOn" ref="video" playsinline muted />
        <div v-if="camOn" class="qr-aim" aria-hidden="true" />
        <div v-if="!camOn" class="qr-cam-off">
          <GameIcon name="spyglass" :size="40" />
          <Button :label="$t('qr.useCamera')" icon="pi pi-camera" @click="startCamera" />
        </div>
        <div v-if="camOn" class="qr-cam-bar">
          <Button v-if="devices.length > 1" icon="pi pi-sync" rounded severity="secondary" :aria-label="$t('qr.switchCamera')" @click="switchCamera" />
          <Button icon="pi pi-times" rounded severity="secondary" :aria-label="$t('qr.stopCamera')" @click="stopCamera" />
        </div>
      </div>
      <div v-if="progress.n" class="qr-progress">
        <div class="row"><b class="grow">{{ $t('qr.read', { have: progress.have, n: progress.n }) }}</b><span class="small faint">{{ pct }}%</span></div>
        <div class="qr-cells">
          <span v-for="i in progress.n" :key="i" :class="{ got: !progress.missing.includes(i - 1) }" />
        </div>
        <div class="small faint">{{ $t('qr.anyOrder') }}</div>
      </div>
      <div class="qr-alt">
        <GameIcon name="scroll-unfurled" :size="22" />
        <div class="grow">
          <b>{{ $t('qr.uploadTitle') }}</b>
          <div class="small muted">{{ $t('qr.uploadHint') }}</div>
        </div>
        <Button :label="$t('qr.upload')" icon="pi pi-upload" severity="secondary" :loading="busy" @click="fileInput.click()" />
        <input ref="fileInput" type="file" accept="image/*" multiple hidden @change="pictures">
      </div>
      <p v-if="error" class="qr-error small" role="alert"><i class="pi pi-exclamation-triangle" /> {{ error }}</p>
    </div>
  </Dialog>
</template>

<style scoped>
.qr { display: flex; flex-direction: column; gap: 14px; }
.qr-intro { margin: 0; }
.qr-stage { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px; border-radius: 18px; background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--gold) 14%, var(--panel)), var(--panel) 70%); border: 1px solid var(--line); }
.qr-code { width: min(340px, 100%); aspect-ratio: 1; padding: 10px; border-radius: 14px; background: #fff; box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(226, 182, 90, 0.5); }
.qr-code :deep(svg) { display: block; width: 100%; height: 100%; }
.qr-wait { display: grid; place-items: center; color: #555; font-size: 28px; }
.qr-dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px; max-width: 340px; }
.qr-dots span { width: 7px; height: 7px; border-radius: 50%; background: var(--tint-3); transition: background 0.15s, transform 0.15s; }
.qr-dots span.on { background: var(--gold); transform: scale(1.4); }
.qr-controls { display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap; }
.qr-speed { display: flex; margin-inline-start: 10px; border: 1px solid var(--line-hi); border-radius: 999px; overflow: hidden; }
.qr-speed button { padding: 6px 12px; border: 0; background: none; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.qr-speed button.on { background: var(--tint-3); color: var(--gold-hi); }
.qr-alt { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; border: 1px dashed var(--line-hi); color: var(--gold); }
.qr-alt b { color: var(--ink); }
.qr-cam { position: relative; display: grid; place-items: center; aspect-ratio: 4 / 3; border-radius: 18px; overflow: hidden; background: #0b0a08; border: 1px solid var(--line); }
.qr-cam video { width: 100%; height: 100%; object-fit: cover; }
.qr-cam-off { display: flex; flex-direction: column; align-items: center; gap: 14px; color: var(--gold); }
.qr-aim { position: absolute; inset: 14%; border-radius: 16px; box-shadow: 0 0 0 999px rgba(0, 0, 0, 0.35); border: 2px solid rgba(226, 182, 90, 0.85); animation: qr-breathe 2.2s ease-in-out infinite; }
@keyframes qr-breathe { 50% { inset: 16%; } }
.qr-cam-bar { position: absolute; inset-inline-end: 10px; bottom: 10px; display: flex; gap: 8px; }
.qr-progress { display: flex; flex-direction: column; gap: 8px; }
.qr-cells { display: grid; grid-template-columns: repeat(auto-fill, minmax(14px, 1fr)); gap: 4px; }
.qr-cells span { height: 10px; border-radius: 3px; background: var(--tint-2); transition: background 0.2s; }
.qr-cells span.got { background: var(--gold); }
.qr-error { margin: 0; color: var(--warn, #e0a050); }
@media (prefers-reduced-motion: reduce) { .qr-aim { animation: none; } }
@media (max-width: 520px) {
  .qr-alt { flex-wrap: wrap; }
  .qr-alt :deep(.p-button) { width: 100%; }
  .qr-speed { margin-inline-start: 0; }
}
</style>
