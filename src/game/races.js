/* =========================================================
   RACES — the people the hero was born among: their bonuses and drawback, their trait, and how they
   fight in their homeland and in the rival land (data/races.js).
   Mixed into G (engine.js); `this` is the engine.
   ========================================================= */
import { RACES, RACE_IDS, DEFAULT_RACE, HOME_DMG, HOME_LOOT, RIVAL_DMG, AETHER_OMENS, LEGACY_XP } from './data/races.js'

export const races = {
  raceId() { return RACES[this.s.race] ? this.s.race : DEFAULT_RACE },
  race() { return RACES[this.raceId()] },
  raceMods(key) { return (this.race().bonus[key] || 0) + (key === 'xp' ? this.raceLegacy() : 0) },
  // Every race a life was completed with leaves a little more experience in every life after it
  raceLegacy() {
    const lived = this.s.ascension?.races || {}
    return RACE_IDS.filter(id => lived[id] > 0).length * LEGACY_XP
  },
  raceTrait(id) { return this.race().trait === id },
  // Maximum health is scaled by this share, so the race weighs the same at every level
  raceHpMult() { return 1 + this.race().hpPct },
  raceOmenMult() { return this.raceTrait('aether') ? AETHER_OMENS : 1 },
  // Fighting a creature of the homeland or of the rival land. Bosses and the tower have no land;
  // dungeons are their own place, so their rooms do not count either
  homeEffect(m, key) {
    if (!m?.area || this.s.activity?.kind === 'dungeon') return 0
    const r = this.race()
    if (m.area === r.home) return key === 'dmg' ? HOME_DMG : key === 'loot' ? HOME_LOOT : 0
    if (m.area === r.rival && key === 'dmg') return RIVAL_DMG
    return 0
  },
}
