<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import GameIcon from './GameIcon.vue'

/* A confirmation for what cannot be undone: it goes ahead only once the code it shows is typed in */
const props = defineProps({
  visible: Boolean,
  header: { type: String, default: '' },
  message: { type: String, default: '' },
  note: { type: String, default: '' },
  confirmLabel: { type: String, default: '' },
})
const emit = defineEmits(['update:visible', 'confirm'])
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O or 1/I to mix up
const code = ref('')
const typed = ref('')
const input = ref(null)
watch(() => props.visible, async v => {
  if (!v) return
  code.value = Array.from(crypto.getRandomValues(new Uint8Array(5)), b => LETTERS[b % LETTERS.length]).join('')
  typed.value = ''
  await nextTick()
  input.value?.$el?.focus()
}, { immediate: true })
const ok = computed(() => typed.value.replace(/\s+/g, '').toUpperCase() === code.value)
const close = () => emit('update:visible', false)
function go() {
  if (!ok.value) return
  emit('confirm')
  close()
}
</script>

<template>
  <Dialog :visible="visible" modal :header="header" style="width: min(440px, calc(100vw - 24px))" @update:visible="v => v || close()">
    <div class="tc">
      <div class="tc-msg"><GameIcon name="skull-crossed-bones" :size="26" /><p>{{ message }}</p></div>
      <p v-if="note" class="small muted tc-note">{{ note }}</p>
      <label class="small" for="tc-input">{{ $t('typed.prompt') }}</label>
      <div class="tc-code" aria-hidden="true"><span v-for="(c, i) in code" :key="i">{{ c }}</span></div>
      <InputText id="tc-input" ref="input" v-model="typed" class="tc-input" :class="{ ok }" maxlength="12" autocomplete="off" autocapitalize="characters" spellcheck="false"
        :aria-label="$t('typed.label', { code: code.split('').join(' ') })" @keyup.enter="go" />
      <div class="row tc-actions">
        <Button :label="$t('common.cancel')" severity="secondary" outlined @click="close" />
        <Button :label="confirmLabel" icon="pi pi-trash" severity="danger" :disabled="!ok" @click="go" />
      </div>
    </div>
  </Dialog>
</template>

<style scoped>
.tc { display: flex; flex-direction: column; gap: 10px; }
.tc-msg { display: flex; gap: 12px; align-items: flex-start; color: var(--danger); }
.tc-msg p { margin: 0; color: var(--ink); }
.tc-note { margin: 0; }
.tc-code { display: flex; justify-content: center; gap: 8px; margin: 4px 0; user-select: none; }
.tc-code span { display: grid; place-items: center; width: 42px; height: 50px; border-radius: 10px; border: 1px solid var(--line-hi); background: var(--tint-2); color: var(--gold-hi); font: 700 24px/1 ui-monospace, monospace; }
.tc-input { text-align: center; letter-spacing: 0.4em; font: 600 18px ui-monospace, monospace; text-transform: uppercase; }
.tc-input.ok { border-color: var(--danger); }
.tc-actions { justify-content: flex-end; gap: 8px; margin-top: 6px; flex-wrap: wrap; }
@media (max-width: 380px) { .tc-code span { width: 36px; height: 44px; font-size: 20px; } }
</style>
