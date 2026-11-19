/* =========================================================
   HOME — boss trophies hung in the house's rooms.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { TROPHIES, TROPHY_MAP, PRODUCERS, PRODUCER_MAP, HOME_STORE_HOURS } from './data/home.js'
import { CROPS, ITEMS } from './data/items.js'
import { ACTIONS } from './data/actions.js'
import { SKILLS, XP_TABLE, MAX_LEVEL } from './data/skills.js'

const HOUR = 3600e3

export const homeState = () => ({
  // trophies: id → when it was hung
  trophies: {},
  // homeWork: room → when its work was last collected
  homeWork: {},
})

export const home = {
  hasTrophy(id) { return !!this.s.trophies?.[id] },
  trophyKills(tr) { return this.s.killsBy[tr.boss] || 0 },
  // Why a trophy cannot be hung yet: 'kills', 'room' or 'cost' (null when it can)
  trophyBlocker(tr) {
    if (this.trophyKills(tr) < tr.kills) return 'kills'
    if (!this.room(tr.room)) return 'room'
    if (!this.canAffordTrophy(tr)) return 'cost'
    return null
  },
  canAffordTrophy(tr) {
    const { gold = 0, ...items } = tr.cost
    return this.s.gold >= gold && this.hasItems(items)
  },
  hangTrophy(id) {
    const tr = TROPHY_MAP[id]
    if (!tr || this.hasTrophy(id) || this.trophyBlocker(tr)) return false
    const { gold = 0, ...items } = tr.cost
    this.s.gold -= gold
    for (const k in items) this.removeItem(k, items[k])
    this.s.trophies[id] = Date.now()
    this.log(tr.icon, 'log.trophy', { trophy: '@trophy:' + id, room: '@room:' + tr.room })
    return true
  },
  trophiesHung() { return TROPHIES.filter(tr => this.hasTrophy(tr.id)).length },
  homeMods(key) { return this.memo('home', this.homeTotals)[key] || 0 },
  // Every bonus of the hung trophies at once
  homeTotals() {
    const out = {}
    for (const tr of TROPHIES) {
      if (!this.hasTrophy(tr.id)) continue
      for (const k in tr.mods) out[k] = (out[k] || 0) + tr.mods[k]
    }
    return out
  },

  /* ---------- rooms that make things on their own ---------- */
  // Starts the clock of every producing room that is built (and stops none)
  ensureHomeWork() {
    const w = (this.s.homeWork ||= {})
    for (const p of PRODUCERS) if (this.room(p.room) && !w[p.room]) w[p.room] = Date.now()
    return w
  },
  // What a room makes: the item (or skill) and how much an hour
  homeTarget(room) {
    const p = PRODUCER_MAP[room], l = this.room(room)
    if (!p || !l) return null
    if (room === 'garden') {
      const lvl = this.level('farming')
      const crop = CROPS.filter(c => c.lvl <= lvl).reduce((a, c) => (c.value > (a?.value || 0) ? c : a), null)
      return crop && { item: crop.id, perHour: p.perHour(l) }
    }
    if (room === 'kitchen') {
      const lvl = this.level('cooking')
      let best = null
      for (const a of ACTIONS.cooking || []) {
        if (a.lvl > lvl) continue
        for (const id in a.out) if (ITEMS[id]?.heal && ITEMS[id].heal > (best ? ITEMS[best].heal : 0)) best = id
      }
      return best && { item: best, perHour: p.perHour(l) }
    }
    if (room === 'library') {
      const skill = Object.keys(SKILLS).reduce((a, k) => (!a || this.s.skills[k].xp < this.s.skills[a].xp ? k : a), null)
      // Past the top level it keeps studying at the pace of the last one
      const lv = Math.min(this.level(skill), MAX_LEVEL - 1)
      return { skill, perHour: Math.round(p.perHour(l) * (XP_TABLE[lv + 1] - XP_TABLE[lv])) }
    }
    return { gold: true, perHour: p.perHour(l, this.heroLevel()) }
  },
  // How much a room has made since it was last collected
  homeStored(room, now = Date.now()) {
    const target = this.homeTarget(room)
    const since = this.s.homeWork?.[room]
    if (!target || !since) return null
    const hours = Math.min(HOME_STORE_HOURS, Math.max(0, (now - since) / HOUR))
    return { ...target, hours, full: hours >= HOME_STORE_HOURS, qty: Math.floor(target.perHour * hours) }
  },
  homeFull() { return PRODUCERS.filter(p => this.homeStored(p.room)?.full).length },
  collectHome(room) {
    const st = this.homeStored(room)
    if (!st || st.qty < 1) return null
    if (st.item) this.addItem(st.item, st.qty)
    else if (st.skill) this.addXp(st.skill, st.qty, false)
    else this.addGold(st.qty)
    // A partial hour is kept for next time, unless the store was full
    this.s.homeWork[room] = st.full ? Date.now() : this.s.homeWork[room] + (st.qty / st.perHour) * HOUR
    return st
  },
  collectAllHome() { return PRODUCERS.map(p => this.collectHome(p.room)).filter(Boolean) },
}
