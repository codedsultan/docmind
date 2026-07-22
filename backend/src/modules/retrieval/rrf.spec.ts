import { reciprocalRankFusion } from './rrf';

describe('reciprocalRankFusion', () => {
  describe('basic math', () => {
    it('assigns 1/(k+1) to the single top-ranked item when both paths agree', () => {
      const vector = new Map([['a', 0.9]]);
      const keyword = new Map([['a', 1.0]]);
      const result = reciprocalRankFusion(vector, keyword);
      // Both paths rank 'a' at position 0 → 2 × 1/(60+1)
      expect(result.get('a')).toBeCloseTo(2 / 61, 8);
    });

    it('correctly sums contributions from two paths for a shared item', () => {
      const vector = new Map([
        ['a', 0.9],
        ['b', 0.8],
      ]);
      const keyword = new Map([
        ['b', 1.0],
        ['a', 0.7],
      ]);
      const result = reciprocalRankFusion(vector, keyword);

      // 'a': vector rank 0 → 1/61; keyword rank 1 → 1/62
      const expectedA = 1 / 61 + 1 / 62;
      // 'b': vector rank 1 → 1/62; keyword rank 0 → 1/61
      const expectedB = 1 / 62 + 1 / 61;

      expect(result.get('a')).toBeCloseTo(expectedA, 8);
      expect(result.get('b')).toBeCloseTo(expectedB, 8);
      // Symmetric: a and b have the same fused score because they swap ranks
      expect(result.get('a')).toBeCloseTo(result.get('b')!, 8);
    });

    it('returns correct RRF for three items with distinct ranks', () => {
      const vector = new Map([
        ['a', 0.95],
        ['b', 0.75],
        ['c', 0.55],
      ]);
      const keyword = new Map([
        ['c', 2.0],
        ['a', 1.5],
        ['b', 0.5],
      ]);
      const result = reciprocalRankFusion(vector, keyword);

      // vector ranks: a=0, b=1, c=2 → 1/61, 1/62, 1/63
      // keyword ranks: c=0, a=1, b=2 → 1/61, 1/62, 1/63
      const expectedA = 1 / 61 + 1 / 62;
      const expectedB = 1 / 62 + 1 / 63;
      const expectedC = 1 / 63 + 1 / 61;

      expect(result.get('a')).toBeCloseTo(expectedA, 8);
      expect(result.get('b')).toBeCloseTo(expectedB, 8);
      expect(result.get('c')).toBeCloseTo(expectedC, 8);
    });
  });

  describe('one-sided inputs', () => {
    it('handles vector-only results (empty keyword map)', () => {
      const vector = new Map([
        ['a', 0.9],
        ['b', 0.5],
      ]);
      const result = reciprocalRankFusion(vector, new Map());
      expect(result.get('a')).toBeCloseTo(1 / 61, 8);
      expect(result.get('b')).toBeCloseTo(1 / 62, 8);
    });

    it('handles keyword-only results (empty vector map)', () => {
      const keyword = new Map([['x', 3.0]]);
      const result = reciprocalRankFusion(new Map(), keyword);
      expect(result.get('x')).toBeCloseTo(1 / 61, 8);
    });

    it('returns empty map when both inputs are empty', () => {
      const result = reciprocalRankFusion(new Map(), new Map());
      expect(result.size).toBe(0);
    });
  });

  describe('ties', () => {
    it('produces deterministic output even when scores are identical (tie)', () => {
      const vector = new Map([
        ['a', 0.5],
        ['b', 0.5],
      ]);
      const result = reciprocalRankFusion(vector, new Map());
      // Both get a score; the total should equal 1/61 + 1/62
      const total = [...result.values()].reduce((s, v) => s + v, 0);
      expect(total).toBeCloseTo(1 / 61 + 1 / 62, 8);
    });
  });

  describe('k sensitivity', () => {
    it('produces a higher score for top item with smaller k', () => {
      const vector = new Map([['a', 1.0]]);
      const lowK = reciprocalRankFusion(vector, new Map(), 1);
      const highK = reciprocalRankFusion(vector, new Map(), 200);
      expect(lowK.get('a')!).toBeGreaterThan(highK.get('a')!);
    });

    it('approaches 1/(position+1) as k approaches 0', () => {
      const vector = new Map([['a', 1.0]]);
      const result = reciprocalRankFusion(vector, new Map(), 0);
      // rank 0 → 1/(0+0+1) = 1/1 = 1
      expect(result.get('a')).toBeCloseTo(1, 8);
    });

    it('returns correct scores with custom k=10', () => {
      const vector = new Map([
        ['a', 0.9],
        ['b', 0.5],
      ]);
      const result = reciprocalRankFusion(vector, new Map(), 10);
      expect(result.get('a')).toBeCloseTo(1 / 11, 8);
      expect(result.get('b')).toBeCloseTo(1 / 12, 8);
    });
  });

  describe('union of ids', () => {
    it('includes items that appear in only one path', () => {
      const vector = new Map([['vec-only', 0.8]]);
      const keyword = new Map([['kw-only', 1.5]]);
      const result = reciprocalRankFusion(vector, keyword);
      expect(result.has('vec-only')).toBe(true);
      expect(result.has('kw-only')).toBe(true);
    });
  });
});
