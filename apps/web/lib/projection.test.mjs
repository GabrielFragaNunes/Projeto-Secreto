import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('./projection.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { calculatePortfolioValue, calculateProjection } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const zeroRates = {
  conservador: 0,
  base: 0,
  otimista: 0,
};

test('creates an annual table through the configured horizon', () => {
  const points = calculateProjection({
    initialWealthBrl: 100,
    monthlyContributionBrl: 10,
    targetBrl: 500,
    startYear: 2026,
    horizonYear: 2028,
    annualRatesPercent: zeroRates,
  });

  assert.deepEqual(points.map((point) => point.year), [2026, 2027, 2028]);
  assert.equal(points[0].base, 100);
  assert.equal(points[1].base, 220);
  assert.equal(points[2].base, 340);
  assert.equal(points[2].meta, 500);
});

test('converts an effective annual rate into deterministic monthly growth', () => {
  const points = calculateProjection({
    initialWealthBrl: 100,
    monthlyContributionBrl: 0,
    targetBrl: 200,
    startYear: 2026,
    horizonYear: 2027,
    annualRatesPercent: {
      conservador: 12,
      base: 12,
      otimista: 12,
    },
  });

  assert.equal(points[1].base, 112);
});

test('rejects invalid input rather than returning a success-shaped projection', () => {
  assert.throws(
    () => calculateProjection({
      initialWealthBrl: -1,
      monthlyContributionBrl: 0,
      targetBrl: 100,
      startYear: 2026,
      horizonYear: 2027,
      annualRatesPercent: zeroRates,
    }),
    RangeError,
  );
  assert.throws(
    () => calculateProjection({
      initialWealthBrl: 0,
      monthlyContributionBrl: 0,
      targetBrl: 100,
      startYear: 2027,
      horizonYear: 2026,
      annualRatesPercent: zeroRates,
    }),
    RangeError,
  );
});

test('calculates the current portfolio value from validated positions', () => {
  assert.equal(calculatePortfolioValue([
    { price: 12.35, quantity: 10 },
    { price: 4.2, quantity: 3 },
  ]), 136.1);
  assert.throws(() => calculatePortfolioValue([{ price: Number.NaN, quantity: 1 }]), RangeError);
});
