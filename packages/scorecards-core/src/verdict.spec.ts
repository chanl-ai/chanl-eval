import { normalizeVerdict, verdictOf, isScoreVerdict } from './verdict';

describe('normalizeVerdict', () => {
  it.each([
    [8, 8],
    [0, 0],
    [true, true],
    [false, false],
  ])('passes through canonical value %p', (input, expected) => {
    expect(normalizeVerdict(input)).toBe(expected);
  });

  // The strings that caused the incidents. Boolean('fail') is true, which inverted meaning.
  it.each([
    ['pass', true],
    ['PASS', true],
    ['  Passed ', true],
    ['true', true],
    ['yes', true],
    ['fail', false],
    ['FAIL', false],
    ['failed', false],
    ['false', false],
    ['no', false],
  ])('reads string verdict %p as %p', (input, expected) => {
    expect(normalizeVerdict(input)).toBe(expected);
  });

  it('reads a numeric string as a score', () => {
    expect(normalizeVerdict('7')).toBe(7);
    expect(normalizeVerdict(' 8.5 ')).toBe(8.5);
  });

  it.each([[null], [undefined], [''], ['  '], ['maybe'], [{}], [[]], [NaN], [Infinity]])(
    'returns null for unreadable value %p',
    (input) => {
      expect(normalizeVerdict(input)).toBeNull();
    },
  );

  it('never returns a truthy value for a failing string', () => {
    // The specific defect: Boolean('fail') === true.
    for (const s of ['fail', 'failed', 'false', 'no']) {
      expect(normalizeVerdict(s)).toBe(false);
    }
  });
});

describe('verdictOf', () => {
  it('prefers the raw verdict when readable', () => {
    expect(verdictOf('fail', true)).toBe(false);
    expect(verdictOf(9, false)).toBe(9);
  });

  it('falls back to passed when the raw verdict is unreadable', () => {
    expect(verdictOf(undefined, true)).toBe(true);
    expect(verdictOf({ odd: 'shape' }, false)).toBe(false);
  });

  it('never returns null', () => {
    for (const raw of [null, undefined, '', 'garbage', {}]) {
      expect(verdictOf(raw, true)).toBe(true);
    }
  });
});

describe('isScoreVerdict', () => {
  it('separates scores from pass/fail', () => {
    expect(isScoreVerdict(7)).toBe(true);
    expect(isScoreVerdict(true)).toBe(false);
    expect(isScoreVerdict(false)).toBe(false);
  });
});
