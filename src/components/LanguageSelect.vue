<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import Select from 'primevue/select'
import { LOCALES, PLAYABLE, setLocale, progressOf } from '../i18n/index.js'

defineProps({ inputId: { type: String, default: 'language-select' } })
const { locale } = useI18n()
// A language not fully translated yet says how far along it is
const options = Object.entries(PLAYABLE).map(([value, l]) => ({ value, label: progressOf(value) < 100 ? `${l.name} · ${progressOf(value)}%` : l.name }))
const current = computed({ get: () => locale.value, set: v => setLocale(v) })
</script>

<template>
  <Select v-model="current" :options="options" optionLabel="label" optionValue="value" :inputId="inputId" :aria-label="$t('settings.language')" size="small">
    <template #value="{ value }"><i class="pi pi-globe" style="margin-inline-end:6px" />{{ LOCALES[value]?.name }}</template>
  </Select>
</template>
