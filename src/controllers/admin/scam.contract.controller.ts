import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import { addScamContract, listScamContracts } from '../../services/tatum/scam.contract.blocklist.service';

export async function listScamContractsController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const page = req.query.page ? Number(req.query.page) : 1;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const result = await listScamContracts({ page, limit });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function addScamContractController(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { blockchain, contractAddress, reason, source } = req.body ?? {};
    if (!blockchain?.trim() || !contractAddress?.trim() || !reason?.trim()) {
      throw new ApiError(400, 'blockchain, contractAddress, and reason are required', null);
    }
    const row = await addScamContract({
      blockchain: String(blockchain),
      contractAddress: String(contractAddress),
      reason: String(reason),
      source: source ? String(source) : undefined,
    });
    res.status(201).json({ success: true, data: row });
  } catch (err) {
    next(err);
  }
}
