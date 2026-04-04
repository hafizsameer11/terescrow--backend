import { Request, Response } from 'express';
import masterWalletService from '../../services/tatum/master.wallet.service';

/**
 * Optional gate (recommended in production): set `PUBLIC_DOGECOIN_MASTER_WALLET_SETUP_SECRET`
 * and pass the same value as `?secret=` or header `x-dogecoin-master-wallet-setup-secret`.
 * If the env var is unset, the route is open (bootstrap only — lock down with the secret).
 */
const SECRET_ENV = 'PUBLIC_DOGECOIN_MASTER_WALLET_SETUP_SECRET';

export async function getSetupDogecoinMasterWalletController(req: Request, res: Response) {
  const configured = process.env[SECRET_ENV]?.trim();
  if (configured) {
    const q = String(req.query.secret ?? '');
    const raw = req.headers['x-dogecoin-master-wallet-setup-secret'];
    const headerVal = Array.isArray(raw) ? raw[0] : raw;
    if (q !== configured && headerVal !== configured) {
      return res.status(404).json({ message: 'Not found' });
    }
  }

  try {
    const wallet = await masterWalletService.createMasterWallet('dogecoin', '/dogecoin/wallet');
    return res.status(200).json({
      status: 'success',
      message:
        'Dogecoin master wallet record is ready. If it already existed, the same row is returned.',
      data: {
        id: wallet.id,
        blockchain: wallet.blockchain,
        address: wallet.address,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
      },
    });
  } catch (err: any) {
    console.error('[public dogecoin master wallet setup]', err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to create Dogecoin master wallet',
    });
  }
}
