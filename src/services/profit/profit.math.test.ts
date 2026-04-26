import test from 'node:test';
import assert from 'node:assert/strict';
import { Decimal } from '@prisma/client/runtime/library';
import { calculateFixedProfit, calculatePercentageProfit, calculateSpreadProfit } from './profit.math';

test('calculateSpreadProfit computes spread * amount', () => {
  const amount = new Decimal('100');
  const buyRate = new Decimal('1450');
  const sellRate = new Decimal('1500');
  const out = calculateSpreadProfit(amount, buyRate, sellRate);
  assert.equal(out.profitValue.toString(), '50');
  assert.equal(out.profitNgn.toString(), '5000');
});

test('calculatePercentageProfit computes base * pct / 100', () => {
  const out = calculatePercentageProfit(new Decimal('10000'), new Decimal('2'));
  assert.equal(out.profitValue.toString(), '2');
  assert.equal(out.profitNgn.toString(), '200');
});

test('calculateFixedProfit returns fixed amount as profit', () => {
  const out = calculateFixedProfit(new Decimal('150'));
  assert.equal(out.profitValue.toString(), '150');
  assert.equal(out.profitNgn.toString(), '150');
});
