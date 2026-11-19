import { named } from '../../i18n/bind.js'

/* ---------------- Races ----------------
   When the Crown of Aether broke, each of its shards changed the land it fell on and the people who
   lived there. A race is one of those peoples: what they do well, the one thing they do worse, a
   trait of their own and a homeland. Names, sayings, the trait and the journal lines are in `races.<id>`.
   bonus: modifier keys added for the whole life · hpPct: share of maximum health gained or lost ·
   home / rival: the area where they fight better, and the one where they fight worse ·
   traitKey: the bonus the trait is made of, told by the trait's own text rather than as a bonus */
export const RACES = {
  // The meadows were the one land the Fracture did not touch
  human: { icon: 'person', color: '#e2b65a', home: 'meadow', rival: null, bonus: { xp: 0.05 }, hpPct: 0, trait: 'unmarked' },
  // The Iron shard: the forge under the caverns still beats
  dwarf: {
    icon: 'dwarf-face', color: '#ff9a3c', home: 'caves', rival: 'celestial',
    bonus: { 'speed.mining': 0.1, 'speed.smithing': 0.1, defense: 0.05, magicDmg: -0.1, 'double.smithing': 0.06 }, hpPct: 0, trait: 'forge', traitKey: 'double.smithing',
  },
  // The forest that remembers the king's road
  elf: {
    icon: 'woman-elf-face', color: '#90be6d', home: 'forest', rival: 'lair',
    bonus: { rangedDmg: 0.1, 'speed.woodcutting': 0.1, mastery: 0.15 }, hpPct: -0.05, trait: 'memory', traitKey: 'mastery',
  },
  // The Sap shard: in the swamp everything grows
  bogkin: {
    icon: 'frog', color: '#5fa86b', home: 'swamp', rival: 'peaks',
    bonus: { heal: 0.15, farmSpeed: 0.1, 'speed.herblore': 0.1, atkSpeed: -0.05 }, hpPct: 0, trait: 'sap',
  },
  // The Winter shard: a cold that is a promise
  frostborn: {
    icon: 'frozen-orb', color: '#8fd0f2', home: 'peaks', rival: 'swamp',
    bonus: { reduction: 0.03, 'speed.gathering': -0.05, offline: 2 }, hpPct: 0.08, trait: 'stillness', traitKey: 'offline',
  },
  // The Flame shard: the oldest fire in the world
  drakeborn: {
    icon: 'dragon-head', color: '#e0602a', home: 'lair', rival: 'forest',
    bonus: { meleeDmg: 0.1, 'speed.firemaking': 0.1, 'speed.cooking': 0.1, fishLuck: -0.1 }, hpPct: 0, trait: 'flame',
  },
  // Touched by the aether that fell from the Eye
  starborn: {
    icon: 'star-swirl', color: '#a98bff', home: 'celestial', rival: 'caves',
    bonus: { magicDmg: 0.12, 'xp.runecrafting': 0.1 }, hpPct: -0.08, trait: 'aether',
  },
}
export const RACE_IDS = Object.keys(RACES)
export const DEFAULT_RACE = 'human'
// Fighting the creatures of the homeland, and of the rival land
export const HOME_DMG = 0.1
export const HOME_LOOT = 0.1
export const RIVAL_DMG = -0.05
// The trait numbers
export const UNMARKED_TALENTS = 2
export const SAP_REGEN = 2
export const AETHER_OMENS = 1.25
// Every race a life was completed with adds this much XP for good
export const LEGACY_XP = 0.01

Object.entries(RACES).forEach(([k, r]) => named(r, `races.${k}.name`, `races.${k}.desc`))
