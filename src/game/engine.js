import { reactive, toRaw } from 'vue'
import { SKILLS, XP_TABLE, MAX_LEVEL } from './data/skills.js'
import { ITEMS, SLOTS, CROPS } from './data/items.js'
import { findAction } from './data/actions.js'
import { WATERS } from './data/fishing.js'
import { BLESSING_DURATION, PRESTIGE } from './data/progression.js'
import {
  SLOT_COUNT, DIFFICULTIES, ATTRIBUTES, ROLES, ORIGINS, TALENTS, POINTS_PER_LEVEL, HERO_MAX_LEVEL, HERO_XP_SHARE, heroXpFor,
  TALENT_POINT_EVERY, MASTERY, TOOL_TYPES, TOOL_SPEED_PER_TIER,
} from './data/character.js'
import { systems, extraState, LOADOUT_SLOTS } from './systems.js'
import { meta, metaState } from './meta.js'
import { ascension, ascensionState } from './ascension.js'
import { collection, collectionState } from './collection.js'
import { omens, omensState } from './omens.js'
import { companions, companionsState } from './companions.js'
import { weekly, weeklyState } from './weekly.js'
import { relicForge, relicForgeState } from './relicforge.js'
import { journal, journalState } from './journal.js'
import { fighting, fightingState } from './fighting.js'
import { guilds, guildsState } from './guilds.js'
import { affairs } from './affairs.js'
import { codex, codexState } from './codex.js'
import { repairNumbers } from './saveGuard.js'
import { recordError } from './feedback.js'
import { crown, crownState } from './crown.js'
import { routines, routinesState } from './routines.js'
import { techniques, techniquesState } from './techniques.js'
import { realm, realmState } from './realm.js'
import { unlocks, unlocksState } from './unlocks.js'
import { echoes } from './echoes.js'
import { records, recordsState } from './records.js'
import { mythics, mythicsState } from './mythics.js'
import { inventory } from './inventory.js'
import { skilling } from './skilling.js'
import { combat } from './combat.js'
import { progress } from './progress.js'
import { races } from './races.js'
import { RACES, DEFAULT_RACE, UNMARKED_TALENTS, SAP_REGEN } from './data/races.js'
import { writeBackup, writeBefore } from './backup.js'
import { slayer } from './slayer.js'
import { company, companyState } from './company.js'
import { tavernGames } from './tavernGames.js'
import { church, churchState } from './church.js'
import { bar } from './bar.js'
import { farm } from './farm.js'
import { thief, thiefState } from './thief.js'
import { festivals, festivalsState } from './festivals.js'
import { weatherAt, skyTotals } from './data/weather.js'
import { FEATURES } from './features.js'
import { OMEN_MAP } from './data/omens.js'
import '../i18n/names.js'

const SLOT_KEY = i => `aetheria-slot-${i}`
const META_KEY = 'aetheria-meta'
// How often a failing save is reported to the player
const SAVE_WARN_EVERY = 5 * 60e3
let saveWarnedAt = 0
const LEGACY_KEY = 'aetheria-save-v2'
export const HP_REGEN = 3          // seconds per HP outside combat
export const HP_REGEN_COMBAT = 6   // seconds per HP while fighting
const LOG_SIZE = 40

const GATHERING = ['mining', 'woodcutting', 'fishing', 'farming', 'thieving']
const ARTISAN = ['smithing', 'cooking', 'firemaking', 'fletching', 'crafting', 'herblore', 'runecrafting', 'prayer']
const skillCat = s => (GATHERING.includes(s) ? 'gathering' : ARTISAN.includes(s) ? 'artisan' : 'other')
const TOOL_FOR = Object.fromEntries(Object.entries(TOOL_TYPES).map(([type, d]) => [d.skill, type]))
const CROP_MAP = Object.fromEntries(CROPS.map(c => [c.id, c]))
const msg = (key, params = {}) => ({ key, params })
// Defaults to compare a save's numbers against, made once
let defaults = null
const DEFAULTS = () => (defaults ||= newState())
// Puts bad numbers back to their defaults and notes it once in the error log for bug reports
function guardNumbers(st, nulls) {
  const bad = repairNumbers(st, DEFAULTS(), nulls)
  if (bad.length) recordError(new Error(`Repaired ${bad.length} bad number(s) in the save: ${bad.slice(0, 5).join(', ')}`), 'save')
  return bad
}
const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v); return true } catch { return false } },
  del(k) { try { localStorage.removeItem(k) } catch { /* storage unavailable */ } },
}

export function newState(profile = {}) {
  const skills = {}
  Object.keys(SKILLS).forEach(id => (skills[id] = { xp: 0 }))
  skills.hitpoints.xp = XP_TABLE[10]
  return {
    version: 3,
    created: Date.now(),
    lastTick: Date.now(),
    name: profile.name || 'Adventurer',
    role: profile.role || 'warrior',
    avatar: profile.avatar || 'wizard-face',
    tint: profile.tint || '#6f5cd2',
    difficulty: profile.difficulty || 'normal',
    // Where the hero comes from (data/character.js ORIGINS)
    origin: ORIGINS[profile.origin] ? profile.origin : 'wanderer',
    // The people the hero was born among (data/races.js)
    race: RACES[profile.race] ? profile.race : DEFAULT_RACE,
    gold: 50,
    skills,
    hero: { xp: 0, attrs: Object.fromEntries(Object.keys(ATTRIBUTES).map(k => [k, 0])), talents: {} },
    mastery: {},
    inventory: {},
    equipment: Object.fromEntries(Object.keys(SLOTS).map(k => [k, null])),
    tools: { pickaxe: null, axe: null, rod: null, sickle: null, lockpick: null },
    farm: { plots: [], auto: true, buildings: {}, made: {}, almanac: {} },
    bait: null,
    food: null,
    potion: null,
    spell: 'wind_strike',
    combatStyle: 'attack',
    autoEatPct: 50,
    activity: null,
    hp: 10,
    hpRegen: 0,
    buffs: { potion: null, elixir: 0 },
    blessings: {},
    killsBy: {},
    quests: {},
    achievements: {},
    rooms: {},
    prestige: {},
    slayer: { task: null, points: 0, completed: 0, streak: 0, offers: [], perks: {}, blocked: [] },
    tower: { best: 0, tokens: 0, cleared: {} },
    stats: { actions: 0, kills: 0, goldEarned: 0, deaths: 0, burnt: 0, rares: 0, playTime: 0, harvests: 0 },
    log: [],
    // Old saves load with the tutorial finished; only new characters get it
    tutorial: { step: 0, done: true, base: null },
    ...extraState(),
    ...metaState(),
    ...ascensionState(),
    ...collectionState(),
    ...omensState(),
    ...companionsState(),
    ...weeklyState(),
    ...relicForgeState(),
    ...journalState(),
    ...fightingState(),
    ...companyState(),
    ...guildsState(),
    ...codexState(),
    ...crownState(),
    ...routinesState(),
    ...techniquesState(),
    ...realmState(),
    ...unlocksState(),
    ...recordsState(),
    ...mythicsState(),
    ...churchState(),
    ...thiefState(),
    ...festivalsState(),
  }
}

export const state = reactive(newState())

function replaceState(next) {
  const fresh = newState()
  for (const k of Object.keys(state)) if (!(k in fresh)) delete state[k]
  for (const k of Object.keys(fresh)) {
    const v = next[k]
    if (v === undefined) state[k] = fresh[k]
    else if (fresh[k] && typeof fresh[k] === 'object' && !Array.isArray(fresh[k]) && v && typeof v === 'object') state[k] = { ...fresh[k], ...v }
    else state[k] = v
  }
  Object.keys(SKILLS).forEach(id => (state.skills[id] ||= { xp: 0 }))
  state.hero.attrs = { ...fresh.hero.attrs, ...(state.hero.attrs || {}) }
  state.hero.talents ||= {}
  if (!Array.isArray(state.farm.plots)) state.farm.plots = []
  if (!Array.isArray(state.log)) state.log = []
  const ex = extraState()
  state.tavern = { ...ex.tavern, ...(state.tavern || {}) }
  state.tavern.dice = { ...ex.tavern.dice, ...(state.tavern.dice || {}) }
  ;['board', 'workers', 'orders', 'reports', 'trips'].forEach(k => { if (!Array.isArray(state.tavern[k])) state.tavern[k] = [] })
  if (!Array.isArray(state.queue)) state.queue = []
  if (!Array.isArray(state.history)) state.history = []
  if (!Array.isArray(state.loadouts)) state.loadouts = []
  while (state.loadouts.length < LOADOUT_SLOTS) state.loadouts.push(null)
  state.settings = { ...ex.settings, ...(state.settings || {}) }
}

// The sky changes every few hours; its modifiers are worked out once a minute
let skyCache = { minute: -1, mods: {}, monster: 1 }

// Which attributes and talents feed each modifier key, so summing a key skips the rest
const ATTR_BY_MOD = {}, TALENTS_BY_MOD = {}
for (const [a, def] of Object.entries(ATTRIBUTES)) for (const [k, per] of Object.entries(def.mods)) (ATTR_BY_MOD[k] ||= []).push([a, per])
for (const tt of TALENTS) if (tt.mod) (TALENTS_BY_MOD[tt.mod] ||= []).push(tt)
// Values remembered for the length of one update (see G.memo)
const TICK_CACHE = new Map()
// The same cache for UI work outside an update (fight estimates for every creature on screen): it
// lives for one task only, so nothing a player does afterwards can find a stale value in it
const UI_CACHE = new Map()
let uiCacheLive = false
// Offline progress is worked out in slices this long, with a breath for the page in between
const SIM_SLICE_MS = 30
const MOD_PREFIX = 'mod|'

export const G = {
  s: state,
  slot: null,
  tracker: null,
  listeners: {},

  /* ================= events ================= */
  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); return () => this.off(evt, fn) },
  off(evt, fn) { this.listeners[evt] = (this.listeners[evt] || []).filter(f => f !== fn) },
  emit(evt, data) {
    if (this.tracker) return
    ;(this.listeners[evt] || []).forEach(fn => fn(data))
  },
  // Messages are { key, params } pairs so they can be shown in any language
  toast(icon, key, params = {}, kind = 'info') { this.emit('toast', { icon, msg: msg(key, params), kind }) },
  log(icon, key, params = {}) {
    this.s.log.unshift({ t: Date.now(), icon, key, params })
    if (this.s.log.length > LOG_SIZE) this.s.log.length = LOG_SIZE
  },

  /* ================= save slots ================= */
  // Move a save from the pre-slot version into slot 1
  migrateLegacy() {
    const raw = store.get(LEGACY_KEY)
    if (!raw || store.get(SLOT_KEY(0))) return
    try {
      const s = JSON.parse(raw)
      Object.assign(s, { role: s.role || 'warrior', difficulty: s.difficulty || 'easy', avatar: 'wizard-face', tint: '#6f5cd2' })
      store.set(SLOT_KEY(0), JSON.stringify(s))
      store.del(LEGACY_KEY)
    } catch { /* unreadable old save */ }
  },
  summarize(s) {
    const lvl = xp => this.levelFromXp(xp)
    return {
      name: s.name, role: s.role, avatar: s.avatar, tint: s.tint, difficulty: s.difficulty || 'normal',
      heroLevel: this.heroLevelFromXp(s.hero?.xp || 0),
      totalLevel: Object.keys(SKILLS).reduce((a, k) => a + lvl(s.skills?.[k]?.xp || 0), 0),
      playTime: s.stats?.playTime || 0, lastTick: s.lastTick, gold: s.gold || 0,
      activity: s.activity ? (s.activity.type === 'skill' ? { skill: s.activity.skill } : { combat: true }) : null,
    }
  },
  listSlots() {
    this.migrateLegacy()
    return Array.from({ length: SLOT_COUNT }, (_, i) => {
      const raw = store.get(SLOT_KEY(i))
      if (!raw) return null
      try { return this.summarize(JSON.parse(raw)) } catch { return null }
    })
  },
  lastSlot() {
    try { const m = JSON.parse(store.get(META_KEY) || '{}'); return Number.isInteger(m.last) && store.get(SLOT_KEY(m.last)) ? m.last : null } catch { return null }
  },
  // False when the slot is empty or its save cannot be read (the backups can still bring it back)
  loadSlot(i) {
    const raw = store.get(SLOT_KEY(i))
    if (!raw) return false
    try {
      replaceState(JSON.parse(raw))
      this.slot = i
      this.migrateState()
    } catch (err) {
      console.error(err)
      this.slot = null
      return false
    }
    store.set(META_KEY, JSON.stringify({ last: i }))
    return true
  },
  newGame(i, profile) {
    replaceState(newState(profile))
    this.slot = i
    this.setupCharacter()
    // A new hero meets the menu screen by screen, unless the player chose to see it all at once
    this.s.unlocks = { open: {}, seen: {} }
    this.ensureRecords()
    if (profile?.gradual === false) this.openAllScreens()
    this.ensureWeekly()
    this.ensureJournal()
    this.checkJournal()
    this.ensureGuilds()
    this.ensureCodex()
    this.s.tutorial = { step: 0, done: profile?.tutorial === false, base: null }
    this.log(ROLES[this.s.role].icon, 'log.start', { name: this.s.name, role: '@role:' + this.s.role })
    this.save()
  },
  deleteSlot(i) {
    store.del(SLOT_KEY(i))
    if (this.lastSlot() === i) store.del(META_KEY)
    if (this.slot === i) this.slot = null
  },
  // True when written. A browser that refuses (storage full or blocked) is reported at most every few minutes
  save() {
    if (this.slot === null) return false
    state.lastTick = Date.now()
    guardNumbers(toRaw(state), false)
    const ok = store.set(SLOT_KEY(this.slot), JSON.stringify(toRaw(state)))
    if (ok) store.set(META_KEY, JSON.stringify({ last: this.slot }))
    else if (Date.now() - saveWarnedAt > SAVE_WARN_EVERY) { saveWarnedAt = Date.now(); this.emit('saveFailed') }
    return ok
  },
  // A copy of this slot in the backup store (see backup.js); resolves when written
  backupNow() {
    if (this.slot === null) return Promise.resolve(null)
    const raw = toRaw(state)
    return writeBackup(this.slot, JSON.stringify(raw), this.summarize(raw))
  },
  // Before an import, a restore or a new hero replaces slot i, its game is kept as the "before" backup so
  // the player can undo it. Reads the slot as stored: in game, save first. Resolves when written
  keepBefore(i) {
    const raw = store.get(SLOT_KEY(i))
    if (!raw) return Promise.resolve(null)
    let info
    try { info = this.summarize(JSON.parse(raw)) } catch { return Promise.resolve(null) }
    return writeBefore(i, raw, info)
  },
  // Downloading or sharing the save counts as a backup the player keeps
  markExported() { this.s.settings.lastExport = Date.now() },
  // A gentle reminder to keep a copy outside the browser: after two hours of play, a week without one,
  // and at most every three days
  backupReminderDue(now = Date.now()) {
    const st = this.s.settings
    if (!st.backupReminder || (this.s.stats.playTime || 0) < 2 * 3600) return false
    return now - (st.lastExport || 0) > 7 * 86400e3 && now - (st.remindedAt || 0) > 3 * 86400e3
  },
  exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(toRaw(state))))) },
  importSave(str) {
    const s = JSON.parse(decodeURIComponent(escape(atob(str.trim()))))
    if (!s || !s.skills) throw new Error('Invalid save')
    this.loadSave(s)
  },
  // Replace the game in the current slot with a save object (from a file or a transfer code)
  loadSave(s) {
    replaceState(JSON.parse(JSON.stringify(s)))
    this.migrateState()
    this.save()
  },
  // Store a save object straight into a slot, from the title screen
  writeSlot(i, s) {
    return store.set(SLOT_KEY(i), JSON.stringify(s))
  },

  freshState(profile) { return newState(profile) },
  setupCharacter() {
    const role = ROLES[this.s.role]
    Object.entries(role.skills).forEach(([k, l]) => (this.s.skills[k].xp = XP_TABLE[l]))
    Object.entries(role.items).forEach(([k, q]) => this.addItem(k, q))
    if (role.gold) this.s.gold += role.gold
    // What the origin adds: a skill raised where the role starts lower, a few items and coins
    const origin = ORIGINS[this.s.origin]
    if (origin) {
      Object.entries(origin.skills || {}).forEach(([k, l]) => { this.s.skills[k].xp = Math.max(this.s.skills[k].xp, XP_TABLE[l]) })
      Object.entries(origin.items || {}).forEach(([k, q]) => this.addItem(k, q))
      if (origin.gold) this.s.gold += origin.gold
    }
    ;['bronze_pickaxe', 'bronze_axe', 'rod'].forEach(id => { this.addItem(id, 1); this.equip(id) })
    role.equip.forEach(id => {
      if (!ITEMS[id]) return
      if (ITEMS[id].stackEquip) this.s.equipment.ammo = id
      else { this.addItem(id, 1); this.equip(id) }
    })
    this.addItem('potato_seed', 6)
    this.s.combatStyle = role.style
    // Heroes start with their food already set to be eaten when hurt
    this.s.food = this.bestFood()
    this.s.hp = this.maxHp()
    this.ensurePlots()
  },
  // Fill in whatever older saves are missing
  migrateState() {
    const st = this.s
    guardNumbers(st, true)
    // The bestiary keeps its own lifetime kill count; saves from before it start from the current one
    if (!Object.keys(st.bestiary.kills).length) st.bestiary.kills = { ...st.killsBy }
    // Events from before omens existed are dropped
    if (st.event && !(OMEN_MAP[st.event.id] && st.event.phase)) st.event = null
    if (!ROLES[st.role]) st.role = 'warrior'
    // Saves from before races were born human
    if (!RACES[st.race]) st.race = DEFAULT_RACE
    // ...and so were the lives they had already completed
    if (st.ascension.count > 0 && !Object.keys(st.ascension.races || {}).length) st.ascension.races = { [DEFAULT_RACE]: st.ascension.count }
    if (!st.unlocks) this.openAllScreens()
    // Quiet pop-ups became a choice of three
    if (st.settings.quietToasts) { st.settings.toasts = 'important'; st.settings.quietToasts = false }
    this.ensureRecords()
    if (!DIFFICULTIES[st.difficulty]) st.difficulty = 'normal'
    if ((st.version || 2) < 3) {
      ;['bronze_pickaxe', 'bronze_axe', 'rod'].forEach(id => { if (!st.tools[ITEMS[id].toolType]) { this.addItem(id, 1); this.equip(id) } })
      st.version = 3
    }
    Object.keys(st.skills).forEach(id => { if (!SKILLS[id]) delete st.skills[id] })
    Object.keys(st.inventory).forEach(id => { if (!ITEMS[id]) delete st.inventory[id] })
    this.ensurePlots()
    this.syncCare()
    this.ensureWeekly()
    this.checkJournal(true)
    this.ensureGuilds()
    this.ensureCodex()
    this.ensureContracts()
    this.ensureSlayer()
    this.ensureChurch()
    this.ensureFarm()
    this.ensureThief()
    this.ensureTrips()
    const fm = st.mastery.fishing
    if (fm) for (const w of WATERS) if (!fm[w.id]) { const best = Math.max(0, ...Object.keys(w.fish).map(id => fm[id] || 0)); if (best) fm[w.id] = best }
    if (st.activity?.type === 'skill' && st.activity.skill === 'fishing' && !findAction('fishing', st.activity.action)) st.activity = null
  },

  /* ================= levels ================= */
  levelFromXp(xp) {
    let lo = 1, hi = MAX_LEVEL
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xp >= XP_TABLE[mid]) lo = mid; else hi = mid - 1 }
    return lo
  },
  level(skill) { return this.levelFromXp(this.s.skills[skill].xp) },
  levelProgress(skill) {
    const l = this.level(skill)
    if (l >= MAX_LEVEL) return 1
    const xp = this.s.skills[skill].xp
    return (xp - XP_TABLE[l]) / (XP_TABLE[l + 1] - XP_TABLE[l])
  },
  xpToNext(skill) {
    const l = this.level(skill)
    return l >= MAX_LEVEL ? 0 : XP_TABLE[l + 1] - this.s.skills[skill].xp
  },
  totalLevel() { return Object.keys(SKILLS).reduce((s, k) => s + this.level(k), 0) },
  maxSkillLevel() { return Math.max(...Object.keys(SKILLS).filter(k => k !== 'hitpoints').map(k => this.level(k))) },
  combatLevel() {
    const L = k => this.level(k)
    const base = 0.25 * (L('defense') + L('hitpoints'))
    const melee = 0.325 * (L('attack') + L('strength'))
    const range = 0.325 * Math.floor(L('ranged') * 1.5)
    const mage = 0.325 * Math.floor(L('magic') * 1.5)
    return Math.floor(base + Math.max(melee, range, mage))
  },

  /* ================= hero level, attributes and talents ================= */
  heroLevelFromXp(xp) {
    let lo = 1, hi = HERO_MAX_LEVEL
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (xp >= heroXpFor(mid)) lo = mid; else hi = mid - 1 }
    return lo
  },
  heroLevel() { return this.heroLevelFromXp(this.s.hero.xp) },
  heroProgress() {
    const l = this.heroLevel()
    if (l >= HERO_MAX_LEVEL) return 1
    return (this.s.hero.xp - heroXpFor(l)) / (heroXpFor(l + 1) - heroXpFor(l))
  },
  heroXpToNext() { const l = this.heroLevel(); return l >= HERO_MAX_LEVEL ? 0 : heroXpFor(l + 1) - this.s.hero.xp },
  addHeroXp(n) {
    const before = this.heroLevel()
    this.s.hero.xp += n
    const after = this.heroLevel()
    if (after > before) {
      this.log('laurel-crown', 'log.heroLevel', { level: after, points: POINTS_PER_LEVEL * (after - before) })
      if (this.tracker) this.tracker.heroLevel = after
      this.ensurePlots()
      this.emit('herolevel', after)
    }
  },
  attr(a) { return (ROLES[this.s.role]?.attrs[a] || 0) + (this.s.hero.attrs[a] || 0) },
  attrPoints() {
    const spent = Object.values(this.s.hero.attrs).reduce((a, b) => a + b, 0)
    return (this.heroLevel() - 1) * POINTS_PER_LEVEL - spent
  },
  allocate(a, n = 1) {
    n = Math.min(n, this.attrPoints())
    if (n <= 0 || !ATTRIBUTES[a]) return false
    this.s.hero.attrs[a] += n
    return true
  },
  talentRank(id) { return this.s.hero.talents[id] || 0 },
  talentPoints() {
    const spent = Object.values(this.s.hero.talents).reduce((a, b) => a + b, 0)
    return Math.floor(this.heroLevel() / TALENT_POINT_EVERY) + (this.raceTrait('unmarked') ? UNMARKED_TALENTS : 0) - spent
  },
  canLearn(tal) {
    return this.talentPoints() > 0 && this.talentRank(tal.id) < tal.max && this.heroLevel() >= tal.lvl && (!tal.role || tal.role === this.s.role) && (!tal.race || tal.race === this.raceId())
  },
  learnTalent(id) {
    const tal = TALENTS.find(x => x.id === id)
    if (!tal || !this.canLearn(tal)) return false
    this.s.hero.talents[id] = this.talentRank(id) + 1
    return true
  },
  respecCost() { return 500 * this.heroLevel() },
  respec() {
    const cost = this.respecCost()
    if (this.s.gold < cost) return false
    this.s.gold -= cost
    Object.keys(this.s.hero.attrs).forEach(k => (this.s.hero.attrs[k] = 0))
    this.s.hero.talents = {}
    this.s.hp = Math.min(this.s.hp, this.maxHp())
    return true
  },

  /* ================= modifiers ================= */
  // Every source of a modifier and how much it adds, for the screens that explain a number
  modSources(key) {
    const out = []
    const push = (src, v) => { if (v) out.push({ src, v }) }
    push('role', ROLES[this.s.role]?.bonus[key] || 0)
    push('race', this.raceMods(key))
    for (const a in ATTRIBUTES) { const per = ATTRIBUTES[a].mods[key]; if (per) push('attr.' + a, per * this.attr(a)) }
    const tal = this.s.hero.talents
    push('talents', TALENTS.reduce((v, tt) => v + (tt.mod === key && tal[tt.id] ? tt.per * tal[tt.id] : 0), 0))
    push('extra', this.extraMods(key))
    push('pets', this.petMods(key))
    push('ascension', this.ascensionMods(key))
    push('sets', this.setMods(key))
    push('bestiary', this.bestiaryMods(key))
    push('festival', this.festivalMods(key))
    push('omens', this.omenMods(key))
    push('weather', this.weatherMods(key))
    push('streak', this.streakMods(key))
    push('guild', this.guildMods(key))
    push('codex', this.codexMods(key))
    push('crown', this.crownMods(key))
    push('technique', this.techniqueMods(key))
    push('company', this.companyMods(key))
    return out
  },
  // Sum of role, attribute, talent and temporary bonuses for a modifier key
  mod(key) {
    // Within one update the sources cannot change, so each key is summed once (see update)
    const c = this.tickCache
    const hit = c?.get(MOD_PREFIX + key)
    if (hit !== undefined) return hit
    const v = this.modNow(key)
    c?.set(MOD_PREFIX + key, v)
    return v
  },
  modNow(key) {
    let v = (ROLES[this.s.role]?.bonus[key] || 0) + this.raceMods(key) + this.extraMods(key) + this.petMods(key) + this.ascensionMods(key) + this.setMods(key) + this.bestiaryMods(key) + this.festivalMods(key) + this.omenMods(key) + this.weatherMods(key) + this.streakMods(key) + this.guildMods(key) + this.codexMods(key) + this.crownMods(key) + this.techniqueMods(key) + this.echoMods(key) + this.trialMods(key) + this.mythicMods(key) + this.companyMods(key)
    for (const [a, per] of ATTR_BY_MOD[key] || []) v += per * this.attr(a)
    const tal = this.s.hero.talents
    for (const tt of TALENTS_BY_MOD[key] || []) if (tal[tt.id]) v += tt.per * tal[tt.id]
    return v
  },
  // Remembers a value for the rest of the current update, when what it depends on cannot change
  // (see update); outside an update it is simply worked out
  memo(key, fn, arg) {
    const c = this.tickCache
    if (!c) return fn.call(this, arg)
    let v = c.get(key)
    if (v === undefined) c.set(key, (v = fn.call(this, arg)))
    return v
  },
  sky() {
    if (!FEATURES.weatherEffects) return { mods: {}, monster: 1 }
    const minute = Math.floor(Date.now() / 60000)
    if (skyCache.minute !== minute) {
      const w = weatherAt()
      skyCache = { minute, mods: skyTotals(w), monster: w.weather.monster || 1 }
    }
    return skyCache
  },
  weatherMods(key) { return this.sky().mods[key] || 0 },
  // Difficulty, a Blood Moon and stormy weather all make monsters stronger
  monsterMult() { return this.diff().monster * this.omenMonsterMult() * this.sky().monster },
  diff() { return DIFFICULTIES[this.s.difficulty] || DIFFICULTIES.normal },
  room(id) { return this.s.rooms[id] || 0 },
  blessed(id) { return (this.s.blessings[id] || 0) > 0 },
  prestigeOf(skill) { return this.s.prestige[skill] || 0 },
  totalPrestige() { return Object.values(this.s.prestige).reduce((a, b) => a + b, 0) },
  xpMult(skill) {
    const base = 1 + this.room('library') * 0.04 + this.prestigeOf(skill) * PRESTIGE.xpPerLevel + this.totalPrestige() * PRESTIGE.globalXp
      + (this.blessed('wisdom') ? 0.1 : 0) + (this.blessed('grace') ? 0.2 : 0) + (this.s.buffs.elixir > 0 ? 0.25 : 0)
      + this.mod('xp') + this.mod('xp.' + skill)
    return base * this.diff().xp
  },
  toolTier(type) { const id = this.s.tools[type]; return id ? ITEMS[id].tier : 0 },
  speedFactor(skill) {
    const cat = skillCat(skill)
    const tool = TOOL_FOR[skill]
    return 1 + (cat === 'gathering' ? this.room('tools') * 0.06 : 0) + (cat === 'artisan' ? this.room('workshop') * 0.06 : 0)
      + this.level('agility') * 0.002 + this.prestigeOf(skill) * PRESTIGE.speedPerLevel
      + (this.blessed('diligence') ? 0.1 : 0) + (this.blessed('grace') ? 0.1 : 0)
      + this.mod('speed') + this.mod('speed.' + cat) + this.mod('speed.' + skill)
      + (tool ? this.toolTier(tool) * TOOL_SPEED_PER_TIER : 0)
  },
  goldMult() { return (1 + this.room('vault') * 0.06 + (this.blessed('fortune') ? 0.15 : 0) + this.mod('gold')) * this.diff().gold },
  offlineCapHours() { return (8 + this.room('bedroom') * 2 + this.mod('offline')) * this.diff().offline },
  maxBlessings() { return 1 + Math.floor(this.level('prayer') / 30) + this.favourPerk('slot') },
  blessingDuration() { return BLESSING_DURATION * (1 + 0.25 * this.room('chapel') + this.mod('blessing') + this.favourPerk('duration')) },
  healMult() { return 1 + this.room('kitchen') * 0.1 + this.mod('heal') },

  /* ================= XP ================= */
  addXp(skill, amount, applyMult = true) {
    const before = this.level(skill)
    const gained = amount * (applyMult ? this.xpMult(skill) : 1)
    this.s.skills[skill].xp = Math.min(200_000_000, this.s.skills[skill].xp + gained)
    if (this.tracker) this.tracker.xp[skill] = (this.tracker.xp[skill] || 0) + gained
    this.addHeroXp(gained * HERO_XP_SHARE)
    this.companionXp(gained)
    const after = this.level(skill)
    if (after > before) {
      if (this.tracker) this.tracker.levels[skill] = after
      this.log(SKILLS[skill].icon, 'log.levelUp', { skill: '@skill:' + skill, level: after })
      this.emit('levelup', { skill, level: after })
    }
  },

  /* ================= per-action mastery ================= */
  masteryXp(skill, id) { return this.s.mastery[skill]?.[id] || 0 },
  masteryLevel(skill, id) { return this.levelFromXp(this.masteryXp(skill, id) * MASTERY.xpScale) },
  masteryProgress(skill, id) {
    const l = this.masteryLevel(skill, id)
    if (l >= MAX_LEVEL) return 1
    const xp = this.masteryXp(skill, id) * MASTERY.xpScale
    return (xp - XP_TABLE[l]) / (XP_TABLE[l + 1] - XP_TABLE[l])
  },
  addMastery(skill, id, amount) {
    const before = this.masteryLevel(skill, id)
    ;(this.s.mastery[skill] ||= {})[id] = this.masteryXp(skill, id) + amount * (1 + this.mod('mastery'))
    const after = this.masteryLevel(skill, id)
    if (after > before && after % 10 === 0) {
      const ref = CROP_MAP[id] && skill === 'farming' ? '@crop:' + id : `@action:${skill}/${id}`
      this.log('laurels-trophy', 'log.mastery', { level: after, name: ref })
      this.emit('mastery', { skill, id, level: after, name: ref })
    }
  },
  maxMastery() {
    let m = 1
    for (const sk in this.s.mastery) for (const id in this.s.mastery[sk]) m = Math.max(m, this.masteryLevel(sk, id))
    return m
  },
  doubleChance(skill, id) {
    return this.mod('double') + this.mod('double.' + skillCat(skill)) + this.mod('double.' + skill) + this.masteryLevel(skill, id) * MASTERY.doublePer
  },
  preserveChance(skill, id) {
    if (skillCat(skill) !== 'artisan') return 0
    return Math.min(0.5, this.mod('preserve') + Math.floor(this.masteryLevel(skill, id) / MASTERY.preserveEvery) * MASTERY.preservePer)
  },

  /* ================= main loop ================= */
  withCache(fn) {
    if (this.tickCache) return fn()
    if (!uiCacheLive) { uiCacheLive = true; UI_CACHE.clear(); queueMicrotask(() => { uiCacheLive = false }) }
    this.tickCache = UI_CACHE
    try { return fn() } finally { this.tickCache = null }
  },
  update(dt) {
    TICK_CACHE.clear()
    this.tickCache = TICK_CACHE
    try { this.tickOnce(dt) } finally { this.tickCache = null }
  },
  tickOnce(dt) {
    const st = this.s
    st.stats.playTime += dt
    for (const k in st.blessings) { if (st.blessings[k] > 0) st.blessings[k] = Math.max(0, st.blessings[k] - dt) }
    if (st.buffs.potion) { st.buffs.potion.t -= dt; if (st.buffs.potion.t <= 0) st.buffs.potion = null }
    if (st.buffs.elixir > 0) st.buffs.elixir = Math.max(0, st.buffs.elixir - dt)
    this.updateFarm(dt)
    this.updateSystems(dt)
    this.updateCompanion(dt)
    this.ensureTasks()

    const act = st.activity
    if (act && act.type === 'skill') this.updateSkill(dt)
    else if (act && act.type === 'combat') {
      this.autoDrink()
      let rem = dt
      // A rounding leftover (0.5 − 5 × 0.1) is not worth a combat step of its own
      while (rem > 1e-9 && st.activity && st.activity.type === 'combat') {
        const step = Math.min(rem, 0.1)
        this.updateCombat(step)
        rem -= step
      }
    }
    const fighting = st.activity && st.activity.type === 'combat'
    const every = fighting ? HP_REGEN_COMBAT : HP_REGEN / (this.raceTrait('sap') ? SAP_REGEN : 1)
    if (st.hp > 0 && st.hp < this.maxHp()) {
      st.hpRegen += dt
      while (st.hpRegen >= every && st.hp < this.maxHp()) { st.hpRegen -= every; st.hp++ }
    } else st.hpRegen = 0
    if (st.hp > this.maxHp()) st.hp = this.maxHp()
    st.lastTick = Date.now()
  },

  // Fast-forward elapsed time on the raw (non-reactive) state and return a summary
  simulate(seconds) {
    const run = this.simStart(seconds)
    this.simStep(run, Infinity)
    return this.simFinish(run)
  },
  // The same in slices of a few milliseconds, so the page can show how far it got (`onProgress`, 0 to 1)
  async simulateAsync(seconds, onProgress) {
    const run = this.simStart(seconds)
    try {
      while (!this.simStep(run, performance.now() + SIM_SLICE_MS)) {
        onProgress?.(run.time / run.total)
        await new Promise(r => setTimeout(r, 0))
      }
    } catch (e) { this.tracker = null; throw e }
    return this.simFinish(run)
  },
  simStart(seconds) {
    const cap = this.offlineCapHours() * 3600
    const total = Math.min(seconds, cap)
    const raw = toRaw(state)
    const activity = raw.activity ? JSON.parse(JSON.stringify(raw.activity)) : null
    this.tracker = { seconds: total, capped: seconds > cap, xp: {}, items: {}, levels: {}, kills: {}, gold: 0, eaten: 0, tokens: 0, heroLevel: 0, stopReason: null, activity }
    return { raw, total, time: 0 }
  },
  // Runs the simulation until it ends or the clock passes `deadline`; true once it is over
  simStep(run, deadline) {
    const { raw } = run, step = 0.5
    this.s = raw
    try {
      for (let n = 0; run.time < run.total; n++) {
        this.update(Math.min(step, run.total - run.time))
        run.time += step
        const idle = !raw.activity && raw.hp >= this.maxHp() && !this.farmBusy() && !raw.buffs.potion && raw.buffs.elixir <= 0
          && Object.values(raw.blessings).every(v => v <= 0) && !this.systemsBusy()
        if (idle) run.time = run.total
        else if ((n & 63) === 63 && performance.now() > deadline) break
      }
    } finally {
      this.s = state
    }
    return run.time >= run.total
  },
  simFinish(run) {
    const summary = this.tracker
    this.tracker = null
    const snap = JSON.parse(JSON.stringify(run.raw))
    for (const k of Object.keys(snap)) state[k] = snap[k]
    this.emit('activity')
    return summary
  },
}

Object.assign(G, races, inventory, skilling, combat, progress, systems, meta, ascension, collection, omens, companions, weekly, relicForge, journal, fighting, company, tavernGames, guilds, affairs, codex, slayer, church, bar, farm, thief, festivals, crown, routines, techniques, realm, unlocks, echoes, records, mythics)

export { SKILLS, ITEMS }
