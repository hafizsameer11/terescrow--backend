import { Decimal } from '@prisma/client/runtime/library';

/** TRX target balance on a deposit address before sending TRC-20 (top-up only the shortfall). */
export type TronTrc20GasConfig = {
  targetTrxOnDeposit: Decimal;
  topUpBufferTrx: Decimal;
  /** Max TRX burn cap passed to Tatum TRC-20 send (not the top-up amount). */
  feeLimitTrx: number;
};

/**
 * USDT TRC-20 transfers typically consume ~6–8 TRX (bandwidth/energy).
 * Other TRC-20 tokens may need more — use a higher target and fee limit.
 */
export function trc20GasConfigForAsset(baseSymbol: string): TronTrc20GasConfig {
  const sym = String(baseSymbol ?? '').toUpperCase();
  if (sym === 'USDT') {
    return {
      targetTrxOnDeposit: new Decimal('8'),
      topUpBufferTrx: new Decimal('0.5'),
      feeLimitTrx: 10,
    };
  }
  return {
    targetTrxOnDeposit: new Decimal('25'),
    topUpBufferTrx: new Decimal('2'),
    feeLimitTrx: 50,
  };
}
