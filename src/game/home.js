/* =========================================================
   HOME — boss trophies hung in the house's rooms.
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { TROPHIES, TROPHY_MAP } from './data/home.js'

export const homeState = () => ({
  // trophies: id → when it was hung
  trophies: {},
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
}
