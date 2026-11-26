import { describe, expect, it } from 'vitest';
import { CHARSETS, assessPassword, generatePassword, generatorEntropy, randomInt } from './password';

describe('password generator', () => {
  it('respects the requested length and clamps to 8–64', () => {
    const base = { upper: true, lower: true, numbers: true, symbols: true };
    expect(generatePassword({ ...base, length: 24 })).toHaveLength(24);
    expect(generatePassword({ ...base, length: 2 })).toHaveLength(8);
    expect(generatePassword({ ...base, length: 500 })).toHaveLength(64);
  });

  it('includes at least one character from every selected set', () => {
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword({ length: 8, upper: true, lower: true, numbers: true, symbols: true });
      for (const set of Object.values(CHARSETS)) expect([...pw].some((c) => set.includes(c))).toBe(true);
    }
  });

  it('only uses selected sets', () => {
    const pw = generatePassword({ length: 64, upper: false, lower: false, numbers: true, symbols: false });
    expect(pw).toMatch(/^[0-9]{64}$/);
  });

  it('computes generator entropy', () => {
    expect(generatorEntropy({ length: 10, upper: false, lower: false, numbers: true, symbols: false })).toBeCloseTo(
      10 * Math.log2(10),
    );
  });

  it('randomInt stays in range', () => {
    for (let i = 0; i < 1000; i++) {
      const n = randomInt(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });
});

describe('strength estimate', () => {
  it('rates weak and strong passwords sensibly', () => {
    expect(assessPassword('password123').score).toBeLessThanOrEqual(1);
    expect(assessPassword('aaaaaaaaaaaa').score).toBe(0);
    expect(assessPassword('Tr0ub4dor&3-xK9#mQ2!vL').score).toBeGreaterThanOrEqual(3);
    expect(assessPassword('').bits).toBe(0);
  });
});
