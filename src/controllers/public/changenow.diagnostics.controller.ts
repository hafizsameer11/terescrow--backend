import { Request, Response } from 'express';
import { runChangeNowDiagnostics } from '../../services/changenow/changenow.diagnostics.service';

/**
 * Public ChangeNOW connectivity report (no JWT).
 * If `CHANGENOW_DIAGNOSTICS_SECRET` is set in env, require matching `?secret=` or header `x-changenow-diagnostics-secret`.
 */
export async function getChangeNowDiagnosticsController(req: Request, res: Response) {
  const configured = process.env.CHANGENOW_DIAGNOSTICS_SECRET?.trim();
  if (configured) {
    const q = String(req.query.secret ?? '');
    const raw = req.headers['x-changenow-diagnostics-secret'];
    const headerVal = Array.isArray(raw) ? raw[0] : raw;
    if (q !== configured && headerVal !== configured) {
      return res.status(404).json({ message: 'Not found' });
    }
  }

  try {
    const data = await runChangeNowDiagnostics();
    return res.status(200).json({
      status: 'success',
      message: 'ChangeNOW API diagnostics',
      data,
    });
  } catch (err: any) {
    console.error('[ChangeNOW diagnostics]', err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Diagnostics failed',
    });
  }
}
