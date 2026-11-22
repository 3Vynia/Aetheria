import { G } from '../game/engine.js'
import { ITEMS } from '../game/data/items.js'
import { AREAS } from '../game/data/combat.js'
import { UNIQUE_MERCS } from '../game/data/company.js'
import { cosmeticsForAch } from '../game/data/cosmetics.js'
import { fmt, fmtDec } from '../game/format.js'
import { guildName } from '../i18n/names.js'
import { t, tm } from '../i18n/index.js'

/*
  How a moment of the game is told: the same words for the pop-up while playing and for the
  welcome-back summary. Each gives [icon, text (may hold <b>), kind]; kind is one of
  myth | rare | success | warn | info, from the most to the least remarkable.
*/
const area = id => AREAS.find(a => a.id === id)?.name || id
const TELL = {
  mythic: d => [ITEMS[d.item].icon, `${t('mythic.notify', { tier: t('mythic.tiers.' + d.tier) })} <b>${ITEMS[d.item].name}</b>`, 'myth'],
  rare: d => [ITEMS[d.item].icon, t('toast.rare', { item: ITEMS[d.item].name }), 'rare'],
  achievement: a => [a.icon, t('toast.achievement', { name: a.name }) + (a.gold ? ` · +${fmt(a.gold)} ${t('common.gold')}` : '') + (cosmeticsForAch(a.id) ? ` · ${t('cosmetics.unlockedToast')}` : ''), 'success'],
  shard: s => [s.icon, t('crown.found', { shard: t(`crown.shards.${s.id}.name`) }), 'rare'],
  ending: e => [e.icon, t('crown.endingToast', { ending: t(`crown.endings.${e.id}.name`) }), 'rare'],
  chapter: c => [c.icon, t('toast.chapter', { name: t(`journal.chapters.${c.id}.title`) }), 'rare'],
  quest: q => [q.icon, t('toast.quest', { name: q.name }), 'success'],
  pet: p => [p.icon, t('toast.pet', { name: p.name }), 'rare'],
  petEgg: () => ['cosmic-egg', t('toast.petEgg'), 'rare'],
  petLevel: d => [d.pet.icon, t('toast.petLevel', { name: G.petName(d.pet.id), level: d.level }), 'success'],
  petBond: d => [d.pet.icon, t('toast.petBond', { name: G.petName(d.pet.id), tier: t(`pets.bond.${d.tier}`) }), 'success'],
  mastery: d => ['laurels-trophy', t('toast.mastery', { level: d.level, name: tm({ key: 'common.raw', params: { v: d.name } }) }), 'success'],
  masterwork: e => ['anvil-impact', t('toast.masterwork', { item: ITEMS[e.item].name }), 'rare'],
  hybrid: e => ['sprout', t('toast.hybrid', { name: t(`crops.${e.id}`) }), 'rare'],
  guardian: e => ['stone-tower', t('toast.guardian', { name: t(`tower.guardians.${e.id}`) }), 'rare'],
  guildRank: e => ['star-medal', t('guilds.rankUp', { guild: guildName(e.guild), rank: t(`guilds.ranks.${e.rank}`) }), 'success'],
  favour: e => ['holy-symbol', t('toast.favour', { n: e.level }), 'success'],
  elite: e => [e.monster.icon, t('toast.elite', { name: t('fighting.eliteName', { kind: t(`fighting.elites.${e.kind}`), name: e.monster.name }) }), 'rare'],
  expedition: r => [r.icon, tm({ key: r.ok ? 'toast.expeditionOk' : 'toast.expeditionFail', params: { name: r.name, exp: '@exp:' + r.exp, gold: fmt(r.gold) } }), r.ok ? 'success' : 'warn'],
  dungeon: d => [d.dg.icon, t('toast.dungeon', { name: d.dg.name, loot: Object.entries(d.got).map(([k, n]) => `${n}× ${ITEMS[k].name}`).join(', ') || t('common.nothing') }), 'success'],
  record: e => [e.icon, t('records.toast', { name: t(`records.names.${e.id}`), n: fmt(e.value), before: fmt(e.before) }), 'success'],
  echo: e => ['trophy', t('echoes.toast', { name: tm({ key: 'echoes.who', params: { monster: '@monster:' + e.id } }), n: e.beaten, total: e.total }), 'success'],
  companionQuest: m => [UNIQUE_MERCS[m.unique].icon, t('company.questToast', { name: t(`company.uniques.${m.unique}.name`) }), 'rare'],
  overrun: e => ['death-skull', t('realm.overrunToast', { area: area(e.area) }), 'warn'],
  cleansed: e => ['laurel-crown', t('realm.cleansedToast', { area: area(e.area), gold: fmt(e.gold) }), 'success'],
  weeklyKill: d => [d.boss.icon, t(d.trophy ? 'toast.weeklyKill' : 'toast.weeklyKillAgain', { name: d.boss.name }), 'rare'],
  boon: b => ['sparkles', t('toast.boon', { name: t(`omens.boons.${b.id}.name`) }), 'success'],
  wish: w => ['burning-meteor', t('toast.wish', { wish: t(`omens.wishes.${w.id}`) }), 'rare'],
  event: e => [e.ev.icon, tm(e.msg), 'rare'],
  unlock: ({ list }) => [list[0].icon, list.length === 1
    ? t('unlocks.toast', { name: t('nav.' + list[0].key), intro: t('unlocks.intro.' + list[0].key) })
    : t('unlocks.toastMany', { names: list.map(x => t('nav.' + x.key)).join(', ') }), 'success'],
  jailed: () => ['padlock', t('toast.jailed'), 'warn'],
  huntStreak: e => ['flame', t('toast.huntStreak', { n: e.n, v: fmtDec(e.bonus * 100) }), 'success'],
}

export const tellMoment = (evt, data) => {
  try { return TELL[evt]?.(data) || null } catch { return null }
}

const RANK = { myth: 0, rare: 1, success: 2, warn: 3, info: 4 }

/* The moments of a summary, the same ones folded together (×3), the most remarkable first.
   Deaths are only counted: the summary shows them as a number */
export function summarise(moments = []) {
  const byText = new Map()
  let deaths = 0
  const achievements = []
  // Steps of the same climb (mastery 20, 30, 40 of one action; a pet's levels) only keep the last one
  const LAST = { mastery: d => d.name, petLevel: d => d.pet?.id, petBond: d => d.pet?.id, guildRank: d => d.guild }
  const lastOf = new Map()
  moments.forEach(({ evt, data }, i) => { if (LAST[evt]) lastOf.set(evt + ':' + JSON.stringify(LAST[evt](data)), i) })
  moments.forEach(({ evt, data }, order) => {
    if (LAST[evt] && lastOf.get(evt + ':' + JSON.stringify(LAST[evt](data))) !== order) return
    if (evt === 'death') { deaths++; return }
    if (evt === 'achievement') { achievements.push({ data, order }); return }
    const told = tellMoment(evt, data)
    if (!told) return
    const [icon, text, kind] = told
    const seen = byText.get(text)
    if (seen) seen.n++
    else byText.set(text, { icon, text, kind, n: 1, order, evt, data })
  })
  // Many achievements at once (an old save catching up) make one line instead of a long list
  if (achievements.length === 1) {
    const [icon, text, kind] = tellMoment('achievement', achievements[0].data)
    byText.set(text, { icon, text, kind, n: 1, order: achievements[0].order, evt: 'achievement' })
  } else if (achievements.length > 1) {
    const names = achievements.map(a => `<b>${a.data.name}</b>`)
    const gold = achievements.reduce((n, a) => n + (a.data.gold || 0), 0)
    const text = t('offline.achievements', { n: achievements.length }) + ': ' + (names.length > 5 ? names.slice(0, 5).join(', ') + '…' : names.join(', '))
      + (gold ? ` · +${fmt(gold)} ${t('common.gold')}` : '')
    byText.set(text, { icon: 'trophy', text, kind: 'success', n: 1, order: achievements[0].order, evt: 'achievement' })
  }
  const list = [...byText.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind] || a.order - b.order)
  return { list, deaths }
}
