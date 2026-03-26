import { Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import { executePublicMasterEthToUsdtSwap } from '../../services/changenow/changenow.public.swap.service';

/**
 * POST /api/public/changenow-master-eth-usdt-swap
 * Body: { "usdNotional": 6.5, "secret": "..." }
 *
 * Guard: if CHANGENOW_PUBLIC_SWAP_SECRET is set, body.secret (or header x-changenow-public-swap-secret) must match.
 */
export async function postPublicMasterEthUsdtSwapController(req: Request, res: Response) {
  try {
    if (process.env.CHANGENOW_PUBLIC_SWAP_ENABLED !== 'true') {
      return res.status(404).json({ message: 'Not found' });
    }

    const configured = process.env.CHANGENOW_PUBLIC_SWAP_SECRET?.trim();
    if (configured) {
      const bodySecret = (req.body as any)?.secret;
      const headerRaw = req.headers['x-changenow-public-swap-secret'];
      const headerSecret = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
      const provided = typeof bodySecret === 'string' ? bodySecret : headerSecret;
      if (provided !== configured) {
        return res.status(404).json({ message: 'Not found' });
      }
    }

    const raw = (req.body as any)?.usdNotional ?? (req.body as any)?.usd;
    const usdNotional =
      raw !== undefined && raw !== null && raw !== ''
        ? parseFloat(String(raw))
        : parseFloat(String(process.env.CHANGENOW_PUBLIC_SWAP_USD_DEFAULT || '6.5'));

    const data = await executePublicMasterEthToUsdtSwap({ usdNotional });

    return res.status(200).json({
      status: 'success',
      message:
        'ChangeNOW swap created and pay-in sent from master wallet. USDT will arrive at the same address after ChangeNOW completes.',
      data,
    });
  } catch (err: any) {
    if (err instanceof ApiError) {
      return res.status(err.status).json({ status: 'error', message: err.message, data: err.data });
    }
    console.error('[public master eth-usdt swap]', err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Swap failed',
    });
  }
}
