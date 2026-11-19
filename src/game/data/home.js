/* =========================================================
   HOME — trophies taken from the realm's bosses and hung in the house.
   Each one needs its boss slain a number of times, its room built and a
   price in gold and the boss's own spoils; once hung it gives a small
   bonus for good.
   ========================================================= */
import { named } from '../../i18n/bind.js'

// kills: times the boss must fall · room: where it hangs · cost: gold and items · mods: what it gives
export const TROPHIES = [
  // The realm's bosses
  { id: 'goblin_crown',    boss: 'goblin_king',      room: 'vault',    icon: 'goblin-head',     tint: '#7fbf5a', kills: 10,
    cost: { gold: 3000, uncut_sapphire: 3 }, mods: { gold: 0.03 } },
  { id: 'troll_hammer',    boss: 'troll_lord',       room: 'armory',   icon: 'troll',           tint: '#a8a08a', kills: 10,
    cost: { gold: 8000, big_bones: 15, uncut_emerald: 3 }, mods: { defense: 0.03 } },
  { id: 'kraken_tentacle', boss: 'kraken',           room: 'kitchen',  icon: 'kraken-tentacle', tint: '#4f8fbf', kills: 10,
    cost: { gold: 15000, raw_shark: 25, uncut_ruby: 3 }, mods: { heal: 0.05 } },
  { id: 'necro_staff',     boss: 'necromancer',      room: 'library',  icon: 'skull-staff',     tint: '#9a7ad0', kills: 10,
    cost: { gold: 25000, death_rune: 60, uncut_diamond: 2 }, mods: { xp: 0.02 } },
  { id: 'dragon_head',     boss: 'ancient_dragon',   room: 'trophy',   icon: 'sea-dragon',      tint: '#d0603a', kills: 10,
    cost: { gold: 60000, dragon_bones: 20 }, mods: { crit: 0.02 } },
  { id: 'void_wings',      boss: 'void_emperor',     room: 'chapel',   icon: 'evil-wings',      tint: '#8a5cff', kills: 10,
    cost: { gold: 100000, void_essence: 15 }, mods: { blessing: 0.1 } },
  { id: 'sun_mask',        boss: 'aether_sovereign', room: 'bedroom',  icon: 'sun-priest',      tint: '#ffd36e', kills: 10,
    cost: { gold: 200000, starlight_shard: 15 }, mods: { offline: 1 } },
  // The dungeon lords
  { id: 'warren_totem',    boss: 'warren_chief',     room: 'tools',    icon: 'goblin-head',     tint: '#b08a5a', kills: 5,
    cost: { gold: 1500, air_rune: 50 }, mods: { 'speed.gathering': 0.02 } },
  { id: 'bone_throne',     boss: 'skeleton_king',    room: 'workshop', icon: 'crowned-skull',   tint: '#e8dcb8', kills: 5,
    cost: { gold: 5000, big_bones: 10 }, mods: { 'speed.artisan': 0.02 } },
  { id: 'naga_scales',     boss: 'naga',             room: 'garden',   icon: 'snake',           tint: '#5fbf7a', kills: 5,
    cost: { gold: 12000, venom_sac: 10 }, mods: { farmYield: 1 } },
  { id: 'frost_mirror',    boss: 'winter_queen',     room: 'trophy',   icon: 'ice-spell-cast',  tint: '#9fd8ff', kills: 5,
    cost: { gold: 20000, ice_shard: 15 }, mods: { critDmg: 0.05 } },
  { id: 'wyrm_shield',     boss: 'bronze_wyrm',      room: 'armory',   icon: 'dragon-breath',   tint: '#c98a3a', kills: 5,
    cost: { gold: 40000, dragon_bones: 10 }, mods: { block: 0.02 } },
  { id: 'rift_eye',        boss: 'rift_warden',      room: 'vault',    icon: 'tentacles-skull', tint: '#6f5cd2', kills: 5,
    cost: { gold: 80000, void_essence: 10 }, mods: { loot: 0.03 } },
]
TROPHIES.forEach(tr => named(tr, `trophies.${tr.id}.name`, `trophies.${tr.id}.desc`))
export const TROPHY_MAP = Object.fromEntries(TROPHIES.map(tr => [tr.id, tr]))
export const trophiesIn = room => TROPHIES.filter(tr => tr.room === room)
