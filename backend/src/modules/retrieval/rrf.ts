/**
 * Reciprocal Rank Fusion — combines two scored result sets into one.
 *
 * Maps contain id → score pairs (higher score = better rank).
 * The function converts scores to ranks internally (rank 1 = highest score).
 * Standard RRF formula: score(d) = Σ  1 / (k + rank(d))
 * Default k=60 per the original Cormack, Clarke & Buettcher 2009 paper.
 */
export function reciprocalRankFusion(
  vectorRanks: Map<string, number>,
  keywordRanks: Map<string, number>,
  k = 60,
): Map<string, number> {
  const fused = new Map<string, number>();

  const addContribution = (scoreMap: Map<string, number>): void => {
    const sorted = [...scoreMap.entries()].sort((a, b) => b[1] - a[1]);
    sorted.forEach(([id], position) => {
      const prev = fused.get(id) ?? 0;
      fused.set(id, prev + 1 / (k + position + 1));
    });
  };

  addContribution(vectorRanks);
  addContribution(keywordRanks);

  return fused;
}
