import {
  MIN_LABELS_FOR_KAPPA,
  agreementFor,
  booleanAgreement,
  confidenceCalibration,
  interpret,
  overallAgreement,
  scoreAgreement,
  type Pair,
} from './agreement';

function bools(pairs: Array<[boolean, boolean]>): Pair[] {
  return pairs.map(([human, judge]) => ({ human, judge }));
}

/** Expand a 2x2 confusion matrix [[a,b],[c,d]] (rows = human, cols = judge) into pairs. */
function fromMatrix2x2(m: [[number, number], [number, number]]): Pair[] {
  const out: Pair[] = [];
  const cat = [false, true];
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      for (let n = 0; n < m[i][j]; n++) out.push({ human: cat[i], judge: cat[j] });
    }
  }
  return out;
}

describe('booleanAgreement (Cohen\'s kappa)', () => {
  it('returns no-data stats for an empty set', () => {
    const s = booleanAgreement([]);
    expect(s).toEqual({
      n: 0,
      underpowered: true,
      rawAgreement: 0,
      kappa: null,
      interpretation: 'no data',
    });
  });

  it('matches the textbook worked example', () => {
    // Classic 2x2: 20 both-yes, 5 human-yes/judge-no, 10 human-no/judge-yes, 15 both-no.
    // po = 35/50 = 0.70; pe = (25*30 + 25*20)/50^2 = (750+500)/2500 = 0.50
    // kappa = (0.70 - 0.50) / (1 - 0.50) = 0.40
    const s = booleanAgreement(
      fromMatrix2x2([
        [15, 10], // human=false: judge false 15, judge true 10
        [5, 20], // human=true:  judge false 5,  judge true 20
      ]),
    );
    expect(s.n).toBe(50);
    expect(s.rawAgreement).toBeCloseTo(0.7, 4);
    expect(s.kappa).toBeCloseTo(0.4, 4);
    expect(s.interpretation).toBe('fair');
  });

  it('scores a perfectly agreeing rater at kappa 1', () => {
    const s = booleanAgreement(
      bools([[true, true], [false, false], [true, true], [false, false]]),
    );
    expect(s.rawAgreement).toBe(1);
    expect(s.kappa).toBe(1);
    expect(s.interpretation).toBe('almost perfect');
  });

  it('scores a judge that always says "pass" near zero despite high raw agreement', () => {
    // This is the whole reason kappa is here: 9 of 10 transcripts genuinely pass, and the judge
    // blindly passes everything. 90% raw agreement, but it carries no information.
    const pairs = bools([
      ...Array.from({ length: 9 }, () => [true, true] as [boolean, boolean]),
      [false, true],
    ]);
    const s = booleanAgreement(pairs);
    expect(s.rawAgreement).toBeCloseTo(0.9, 4);
    expect(s.kappa).toBe(0);
    expect(s.interpretation).toBe('poor');
  });

  it('goes negative when the judge is worse than chance', () => {
    const s = booleanAgreement(
      bools([[true, false], [false, true], [true, false], [false, true]]),
    );
    expect(s.kappa).toBeLessThan(0);
    expect(s.interpretation).toBe('poor');
  });

  it('returns null kappa (not 1) when every rating is the same category', () => {
    // Perfect agreement, but zero variance — chance correction is undefined. rawAgreement carries
    // the honest signal here.
    const s = booleanAgreement(bools([[true, true], [true, true], [true, true]]));
    expect(s.rawAgreement).toBe(1);
    expect(s.kappa).toBeNull();
    expect(s.interpretation).toBe('no data');
  });

  it('ignores pairs of the wrong shape', () => {
    const s = booleanAgreement([
      { human: true, judge: true },
      { human: 5, judge: 5 },
    ]);
    expect(s.n).toBe(1);
  });
});

describe('scoreAgreement (quadratic-weighted kappa)', () => {
  it('returns no-data stats for an empty set', () => {
    expect(scoreAgreement([]).interpretation).toBe('no data');
  });

  it('scores identical ratings at kappa 1', () => {
    const s = scoreAgreement([
      { human: 9, judge: 9 },
      { human: 3, judge: 3 },
      { human: 7, judge: 7 },
    ]);
    expect(s.kappa).toBe(1);
    expect(s.rawAgreement).toBe(1);
    expect(s.meanAbsoluteError).toBe(0);
    expect(s.withinOne).toBe(1);
  });

  it('penalises a distant disagreement far more than an adjacent one', () => {
    const adjacent = scoreAgreement([
      { human: 8, judge: 7 },
      { human: 3, judge: 3 },
      { human: 9, judge: 9 },
      { human: 2, judge: 2 },
    ]);
    const distant = scoreAgreement([
      { human: 8, judge: 1 },
      { human: 3, judge: 3 },
      { human: 9, judge: 9 },
      { human: 2, judge: 2 },
    ]);
    expect(adjacent.kappa!).toBeGreaterThan(distant.kappa!);
    // Unweighted kappa would score these two identically — both are "one disagreement out of four".
    expect(adjacent.rawAgreement).toBe(distant.rawAgreement);
  });

  it('reports withinOne and MAE on the unrounded values', () => {
    const s = scoreAgreement([
      { human: 8, judge: 7.5 },
      { human: 4, judge: 9 },
    ]);
    expect(s.withinOne).toBeCloseTo(0.5, 4);
    expect(s.meanAbsoluteError).toBeCloseTo((0.5 + 5) / 2, 4);
  });

  it('clamps out-of-range scores instead of dropping them', () => {
    const s = scoreAgreement([
      { human: 12, judge: 10 },
      { human: -3, judge: 0 },
    ]);
    expect(s.n).toBe(2);
    expect(s.kappa).not.toBeNaN();
  });

  it('returns null kappa when every score is identical across both raters', () => {
    const s = scoreAgreement([
      { human: 7, judge: 7 },
      { human: 7, judge: 7 },
    ]);
    expect(s.rawAgreement).toBe(1);
    expect(s.kappa).toBeNull();
  });
});

describe('agreementFor', () => {
  it('routes boolean pairs to the unweighted statistic', () => {
    const s = agreementFor(bools([[true, true], [false, false]]));
    expect(s.withinOne).toBeUndefined();
  });

  it('routes numeric pairs to the score statistic', () => {
    const s = agreementFor([{ human: 8, judge: 7 }, { human: 2, judge: 3 }]);
    expect(s.withinOne).toBeDefined();
    expect(s.meanAbsoluteError).toBeDefined();
  });

  it('reports mean judge confidence when present', () => {
    const s = agreementFor([
      { human: true, judge: true, judgeConfidence: 1 },
      { human: false, judge: false, judgeConfidence: 0.5 },
    ]);
    expect(s.meanJudgeConfidence).toBeCloseTo(0.75, 4);
  });

  it('omits mean confidence when the judge reported none', () => {
    expect(agreementFor(bools([[true, true]])).meanJudgeConfidence).toBeUndefined();
  });
});

describe('confidenceCalibration', () => {
  it('shows positive lift when confidence predicts correctness', () => {
    const c = confidenceCalibration([
      { human: true, judge: true, judgeConfidence: 1 },
      { human: false, judge: false, judgeConfidence: 1 },
      { human: true, judge: false, judgeConfidence: 0.34 },
      { human: false, judge: true, judgeConfidence: 0.34 },
    ]);
    expect(c.highConfidence).toEqual({ n: 2, rawAgreement: 1 });
    expect(c.lowConfidence).toEqual({ n: 2, rawAgreement: 0 });
    expect(c.lift).toBe(1);
  });

  it('shows no lift when confidence is decoration', () => {
    const c = confidenceCalibration([
      { human: true, judge: true, judgeConfidence: 1 },
      { human: true, judge: false, judgeConfidence: 1 },
      { human: true, judge: true, judgeConfidence: 0.5 },
      { human: true, judge: false, judgeConfidence: 0.5 },
    ]);
    expect(c.lift).toBe(0);
  });

  it('returns null lift when one side has no samples', () => {
    const c = confidenceCalibration([
      { human: true, judge: true, judgeConfidence: 1 },
    ]);
    expect(c.lift).toBeNull();
  });
});

describe('overallAgreement (mixed criterion types)', () => {
  const mixed: Pair[] = [
    // 2 boolean labels, one agreeing
    { human: true, judge: true },
    { human: false, judge: true },
    // 4 score labels, two within 1 point
    { human: 1, judge: 4 },
    { human: 4, judge: 4 },
    { human: 1, judge: 4 },
    { human: 5, judge: 4 },
  ];

  it('counts EVERY label, not just one type', () => {
    // The bug this replaced: routing a mixed set through agreementFor picked the score statistic,
    // silently discarded both boolean labels, and reported n=4 for 6 recorded labels.
    expect(overallAgreement(mixed).n).toBe(6);
    expect(agreementFor(mixed).n).toBe(4); // documents why agreementFor must not be used here
  });

  it('reports one raw agreement spanning both types', () => {
    // agree: (true,true), (4,4), (5,4) => 3 of 6
    expect(overallAgreement(mixed).rawAgreement).toBeCloseTo(0.5, 4);
  });

  it('keeps the two kappas separate rather than pooling them', () => {
    const o = overallAgreement(mixed);
    expect(o.boolean.n).toBe(2);
    expect(o.score.n).toBe(4);
    expect(o.score.withinOne).toBeDefined();
    expect(o.boolean.withinOne).toBeUndefined();
  });

  it('handles an all-boolean set without inventing score stats', () => {
    const o = overallAgreement([{ human: true, judge: true }]);
    expect(o.n).toBe(1);
    expect(o.score.n).toBe(0);
    expect(o.score.interpretation).toBe('no data');
  });

  it('handles an empty set', () => {
    const o = overallAgreement([]);
    expect(o).toMatchObject({ n: 0, rawAgreement: 0 });
  });
});

describe('underpowered flag', () => {
  it('flags a single label so the UI does not render a verdict from noise', () => {
    // One disagreeing boolean label yields kappa exactly 0 -> "poor", which says nothing about the
    // judge. The flag is what stops that being shown as a finding.
    const s = booleanAgreement(bools([[true, false]]));
    expect(s.n).toBe(1);
    expect(s.underpowered).toBe(true);
  });

  it('clears once there are enough labels', () => {
    const many = bools(
      Array.from({ length: MIN_LABELS_FOR_KAPPA }, (_, i) =>
        i % 2 === 0 ? [true, true] : [false, false],
      ) as Array<[boolean, boolean]>,
    );
    expect(booleanAgreement(many).underpowered).toBe(false);
  });

  it('flags empty sets', () => {
    expect(booleanAgreement([]).underpowered).toBe(true);
    expect(scoreAgreement([]).underpowered).toBe(true);
  });
});

describe('interpret', () => {
  it('maps kappa onto Landis & Koch bands', () => {
    expect(interpret(null)).toBe('no data');
    expect(interpret(-0.2)).toBe('poor');
    expect(interpret(0.1)).toBe('slight');
    expect(interpret(0.3)).toBe('fair');
    expect(interpret(0.5)).toBe('moderate');
    expect(interpret(0.7)).toBe('substantial');
    expect(interpret(0.9)).toBe('almost perfect');
  });
});
