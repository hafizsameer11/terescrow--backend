import { Decimal } from '@prisma/client/runtime/library';

/** TRX target balance on a deposit address before sending TRC-20 (top-up only the shortfall). */
export type TronTrc20GasConfig = {
  targetTrxOnDeposit: Decimal;
  topUpBufferTrx: Decimal;
  /** Max TRX burn cap passed to Tatum TRC-20 send (not the top-up amount). */
  feeLimitTrx: number;
};

/**
 * USDT TRC-20 transfers typically consume ~7–12 TRX (energy varies with network load).
 * feeLimitTrx is the max TRX the tx may burn — must be above peak observed cost (~10.35+).
 */
export function trc20GasConfigForAsset(baseSymbol: string): TronTrc20GasConfig {
  const sym = String(baseSymbol ?? '').toUpperCase();
  if (sym === 'USDT') {
    return {
      targetTrxOnDeposit: new Decimal('12'),
      topUpBufferTrx: new Decimal('1'),
      feeLimitTrx: 20,
    };
  }
  return {
    targetTrxOnDeposit: new Decimal('25'),
    topUpBufferTrx: new Decimal('2'),
    feeLimitTrx: 50,
  };
}
