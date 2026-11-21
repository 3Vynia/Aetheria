import { XP_TABLE } from './data/skills.js'

/*
  The review a save gets when it does not come sealed by the game (an old JSON backup, or anything
  written by hand or by a chatbot). It only checks what no honest game can break, with wide margins,
  so a real save is never caught:
  - its dates: made after the game existed, and not in the future;
  - its play time: no more than the real time since it was created;
  - its experience: no faster than the fastest the game allows, with every bonus at once;
  - its gold and the amounts of its items.
  Each rule that fails is named in `reasons`.
*/
export const GAME_BIRTH = Date.UTC(2026, 8, 1) // the first saves of the game
// More than any hero can earn in an hour, every skill and bonus together (the best actions give
// about 0.75M an hour before bonuses)
export const XP_PER_HOUR_CAP = 6e6
export const SKILL_XP_CAP = 200e6
export const ITEM_CAP = 1e9
export const GOLD_CAP = 1e13
const DAY = 86400e3

const num = v => typeof v === 'number' && Number.isFinite(v)

export function reviewSave(s, now = Date.now()) {
  const reasons = []
  const fail = r => reasons.includes(r) || reasons.push(r)
  if (!s || typeof s !== 'object' || !s.skills) return { ok: false, reasons: ['shape'] }

  // Dates (the oldest saves have none, and are not judged on them)
  const created = s.created, last = s.lastTick
  const dated = num(created)
  if (dated && (created < GAME_BIRTH || created > now + DAY)) fail('created')
  if (dated && num(last) && (last < created - DAY || last > now + DAY)) fail('lastTick')

  // Play time cannot be longer than the time the save has existed (time away is part of it), with a
  // margin for clocks that were changed
  const play = s.stats?.playTime || 0
  if (!num(play) || play < 0) fail('playTime')
  else if (dated) {
    const lived = ((num(last) ? last : now) - created) / 1000
    if (play > Math.max(0, lived) * 1.1 + 2 * DAY / 1000) fail('playTime')
  }

  // Experience
  let total = 0
  for (const k of Object.values(s.skills)) {
    const xp = k?.xp
    if (!num(xp) || xp < 0 || xp > SKILL_XP_CAP) { fail('skillXp'); continue }
    total += xp
  }
  const hours = Math.max(play, 0) / 3600
  if (total > hours * XP_PER_HOUR_CAP + XP_TABLE[30] * 4) fail('xpRate')
  const hero = s.hero?.xp || 0
  if (!num(hero) || hero < 0 || hero > hours * XP_PER_HOUR_CAP * 0.5 + 1e6) fail('heroXp')

  // Gold: what is held must have been earned (selling, rewards, hunting), with room for starting gold
  const gold = s.gold || 0, earned = s.stats?.goldEarned || 0
  if (!num(gold) || gold < 0 || gold > GOLD_CAP || gold > earned * 1.5 + 1e6) fail('gold')

  // Items in sane amounts (names are not checked: older saves use names that are renamed on load)
  for (const q of Object.values(s.inventory || {})) if (!num(q) || q < 0 || q > ITEM_CAP) fail('itemCount')
  return { ok: reasons.length === 0, reasons }
}
