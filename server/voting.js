'use strict';

/** Tek bir oylama turu: her oyuncu yalnızca bir kez oy kullanabilir. */
class VoteBox {
  constructor(kind, allowed, optionCount = 4) {
    this.kind = kind; // 'main' | 'revote' | 'tiebreak'
    this.optionCount = optionCount;
    this.allowed = new Set(allowed);
    this.votes = new Map(); // playerId -> option index
  }

  cast(playerId, option) {
    if (!Number.isInteger(option) || option < 0 || option >= this.optionCount) {
      return { ok: false, reason: 'Geçersiz seçenek.' };
    }
    if (!this.allowed.has(option)) return { ok: false, reason: 'Bu seçenek şu an oylanamaz.' };
    if (this.votes.has(playerId)) return { ok: false, reason: 'Bu soruda zaten oy kullandınız.' };
    this.votes.set(playerId, option);
    return { ok: true };
  }

  counts() {
    const c = new Array(this.optionCount).fill(0);
    for (const o of this.votes.values()) c[o]++;
    return c;
  }

  total() { return this.votes.size; }
  voteOf(playerId) { return this.votes.has(playerId) ? this.votes.get(playerId) : null; }
}

/** counts dizisinden en çok oy alan seçenek(ler). */
function leaders(counts, allowed) {
  let top = 0;
  for (const i of allowed) top = Math.max(top, counts[i]);
  if (top === 0) return { top: 0, tied: [] };
  return { top, tied: [...allowed].filter((i) => counts[i] === top) };
}

function percents(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  return counts.map((c) => (total ? Math.round((c / total) * 100) : 0));
}

module.exports = { VoteBox, leaders, percents };
