function scoreContributions(completedSubtasks) {
  const scored = completedSubtasks.map(st => {
    const tokensNorm = Math.min(st.tokens_used / 1000, 5);
    const raw = tokensNorm * st.complexity_weight * (st.quality_score || 1.0);
    return { ...st, raw_score: raw };
  });

  const totalRaw = scored.reduce((s, st) => s + st.raw_score, 0);
  if (totalRaw === 0) {
    const even = 1 / scored.length;
    return scored.map(st => ({ ...st, contribution_pct: even }));
  }

  return scored.map(st => ({
    ...st,
    contribution_pct: st.raw_score / totalRaw,
  }));
}

function allocatePayments(scoredSubtasks, totalBudget) {
  return scoredSubtasks.map(st => ({
    ...st,
    payment_usdc: parseFloat((st.contribution_pct * totalBudget).toFixed(6)),
  }));
}

module.exports = { scoreContributions, allocatePayments };
