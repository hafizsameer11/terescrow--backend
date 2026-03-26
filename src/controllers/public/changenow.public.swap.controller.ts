import { Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import { executePublicMasterEthToUsdtSwap } from '../../services/changenow/changenow.public.swap.service';

/**
 * Shared handler for GET (browser) and POST (curl).
 *
 * - Disabled only if `CHANGENOW_PUBLIC_SWAP_ENABLED=false` (explicit).
 * - If `CHANGENOW_PUBLIC_SWAP_SECRET` is set, pass the same value as query `secret`, body `secret`, or header `x-changenow-public-swap-secret`.
 *
 * GET example (browser):
 *   /api/public/changenow-master-eth-usdt-swap?usdNotional=7
 *   /api/public/changenow-master-eth-usdt-swap?usdNotional=7&secret=YOUR_SECRET
 */
export async function handlePublicMasterEthUsdtSwap(req: Request, res: Response) {
  try {
    if (process.env.CHANGENOW_PUBLIC_SWAP_ENABLED === 'false') {
      return res.status(404).json({ message: 'Not found' });
    }

    const configured = process.env.CHANGENOW_PUBLIC_SWAP_SECRET?.trim();
    if (configured) {
      const bodySecret = (req.body as any)?.secret;
      const qSecret = typeof req.query.secret === 'string' ? req.query.secret : undefined;
      const headerRaw = req.headers['x-changenow-public-swap-secret'];
      const headerSecret = Array.isArray(headerRaw) ? headerRaw[0] : headerRaw;
      const provided =
        typeof bodySecret === 'string' && bodySecret.length > 0
          ? bodySecret
          : qSecret && qSecret.length > 0
            ? qSecret
            : headerSecret;
      if (provided !== configured) {
        return res.status(404).json({
          message: 'Not found',
          hint: configured
            ? 'Provide matching secret: ?secret=... or header x-changenow-public-swap-secret'
            : undefined,
        });
      }
    }

    const raw =
      (req.body as any)?.usdNotional ??
      (req.body as any)?.usd ??
      req.query.usdNotional ??
      req.query.usd;
    const usdNotional =
      raw !== undefined && raw !== null && String(raw).trim() !== ''
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
