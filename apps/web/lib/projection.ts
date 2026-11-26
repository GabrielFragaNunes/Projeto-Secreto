export type ProjectionScenario = 'conservador' | 'base' | 'otimista';

export interface ProjectionInput {
  initialWealthBrl: number;
  monthlyContributionBrl: number;
  targetBrl: number;
  startYear: number;
  horizonYear: number;
  annualRatesPercent: Record<ProjectionScenario, number>;
}

export interface ProjectionPoint {
  year: number;
  conservador: number;
  base: number;
  otimista: number;
  meta: number;
}

const SCENARIOS: ProjectionScenario[] = ['conservador', 'base', 'otimista'];

function assertFiniteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} deve ser um número finito não negativo.`);
  }
}

function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('A projeção excede o intervalo numérico suportado.');
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculatePortfolioValue(positions: unknown): number {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new RangeError('A carteira atual não contém posições para calcular o patrimônio.');
  }

  let total = 0;
  for (const position of positions) {
    if (
      typeof position !== 'object'
      || position === null
      || !('price' in position)
      || !('quantity' in position)
      || typeof position.price !== 'number'
      || typeof position.quantity !== 'number'
      || !Number.isFinite(position.price)
      || !Number.isFinite(position.quantity)
      || position.price < 0
      || position.quantity < 0
    ) {
      throw new RangeError('A carteira atual contém preço ou quantidade inválidos.');
    }
    total += position.price * position.quantity;
  }
  return roundCurrency(total);
}

function futureValue(
  initialValue: number,
  monthlyContribution: number,
  annualRatePercent: number,
  months: number,
): number {
  const monthlyRate = Math.pow(1 + annualRatePercent / 100, 1 / 12) - 1;
  if (monthlyRate === 0) {
    return roundCurrency(initialValue + monthlyContribution * months);
  }

  const growthFactor = Math.pow(1 + monthlyRate, months);
  const value = initialValue * growthFactor
    + monthlyContribution * ((growthFactor - 1) / monthlyRate);
  return roundCurrency(value);
}

export function calculateProjection(input: ProjectionInput): ProjectionPoint[] {
  assertFiniteNonNegative(input.initialWealthBrl, 'O patrimônio inicial');
  assertFiniteNonNegative(input.monthlyContributionBrl, 'O aporte mensal');
  if (!Number.isFinite(input.targetBrl) || input.targetBrl <= 0) {
    throw new RangeError('A meta patrimonial deve ser maior que zero.');
  }
  if (!Number.isInteger(input.startYear) || !Number.isInteger(input.horizonYear)) {
    throw new RangeError('Os anos devem ser números inteiros.');
  }
  if (input.horizonYear < input.startYear) {
    throw new RangeError('O horizonte deve ser igual ou posterior ao ano inicial.');
  }

  for (const scenario of SCENARIOS) {
    const annualRate = input.annualRatesPercent[scenario];
    if (!Number.isFinite(annualRate) || annualRate <= -100) {
      throw new RangeError(`A taxa anual do cenário ${scenario} deve ser maior que -100%.`);
    }
  }

  const points: ProjectionPoint[] = [];
  for (let year = input.startYear; year <= input.horizonYear; year += 1) {
    const months = (year - input.startYear) * 12;
    points.push({
      year,
      conservador: futureValue(
        input.initialWealthBrl,
        input.monthlyContributionBrl,
        input.annualRatesPercent.conservador,
        months,
      ),
      base: futureValue(
        input.initialWealthBrl,
        input.monthlyContributionBrl,
        input.annualRatesPercent.base,
        months,
      ),
      otimista: futureValue(
        input.initialWealthBrl,
        input.monthlyContributionBrl,
        input.annualRatesPercent.otimista,
        months,
      ),
      meta: roundCurrency(input.targetBrl),
    });
  }
  return points;
}
