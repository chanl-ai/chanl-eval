import { LabelsService } from './labels.service';

/**
 * `agreed` drives the disagreement queue and the human/judge pairing behind kappa. Deriving it by
 * coercing a loosely-typed `result` inverts meaning on string verdicts: Boolean('fail') is true, so
 * a human overruling a failed criterion records as agreement.
 *
 * Exercised through the public upsert so the stored value is what is asserted, not a private helper.
 */
describe('LabelsService — agreement derivation over loose verdict types', () => {
  function serviceWith(criterionResult: unknown) {
    const saved: Record<string, any>[] = [];

    const resultModel = {
      findById: jest.fn().mockResolvedValue({
        _id: 'r1',
        scorecardId: { toString: () => 'sc1' },
        scenarioExecutionId: 'exec-1',
        criteriaResults: [
          {
            criteriaId: 'c1',
            criteriaKey: 'empathy',
            criteriaName: 'Empathy',
            result: criterionResult,
            passed: false,
            reasoning: 'because',
          },
        ],
      }),
    };

    const labelModel = {
      findOneAndUpdate: jest.fn((_q: any, update: any) => {
        saved.push(update.$set);
        return Promise.resolve(update.$set);
      }),
    };

    const service = new LabelsService(labelModel as any, resultModel as any);
    return { service, saved };
  }

  it.each([
    // judge verdict, human verdict, expected `agreed`
    ['fail', true, false],
    ['fail', false, true],
    ['pass', true, true],
    ['pass', false, false],
    [false, true, false],
    [true, true, true],
  ])(
    'judge %p vs human %p records agreed=%p',
    async (judge, human, expected) => {
      const { service, saved } = serviceWith(judge);
      await service.upsert({
        scorecardResultId: 'r1',
        criteriaId: 'c1',
        humanResult: human as boolean,
      });
      expect(saved[0].agreed).toBe(expected);
    },
  );

  it('treats a string verdict as boolean, not as a score', async () => {
    const { service, saved } = serviceWith('pass');
    await service.upsert({
      scorecardResultId: 'r1',
      criteriaId: 'c1',
      humanResult: true,
    });
    expect(saved[0].evaluationType).toBe('boolean');
  });

  it('treats a numeric verdict as a score and allows a one-point tolerance', async () => {
    const near = serviceWith(8);
    await near.service.upsert({
      scorecardResultId: 'r1',
      criteriaId: 'c1',
      humanResult: 7,
    });
    expect(near.saved[0].evaluationType).toBe('score');
    expect(near.saved[0].agreed).toBe(true);

    const far = serviceWith(8);
    await far.service.upsert({
      scorecardResultId: 'r1',
      criteriaId: 'c1',
      humanResult: 2,
    });
    expect(far.saved[0].agreed).toBe(false);
  });

  it('records disagreement when the judge verdict is unreadable', async () => {
    const { service, saved } = serviceWith({ unexpected: 'shape' });
    await service.upsert({
      scorecardResultId: 'r1',
      criteriaId: 'c1',
      humanResult: true,
    });
    expect(saved[0].agreed).toBe(false);
  });
});
