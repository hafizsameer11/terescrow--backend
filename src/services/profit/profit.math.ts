import { Decimal } from '@prisma/client/runtime/library';

export function calculateSpreadProfit(amount: Decimal, buyRate: Decimal, sellRate: Decimal) {
  const profitValue = sellRate.minus(buyRate);
  return {
    profitValue,
    profitNgn: profitValue.mul(amount),
  };
}

export function calculatePercentageProfit(baseAmount: Decimal, percentage: Decimal) {
  return {
    profitValue: percentage,
    profitNgn: baseAmount.mul(percentage.div(100)),
  };
}

export function calculateFixedProfit(value: Decimal) {
  return {
    profitValue: value,
    profitNgn: value,
  };
}
