import { Request, Response, NextFunction } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { prisma } from '../../utils/prisma';
import { validationResult } from 'express-validator';

/**
 * Get all bank accounts
 * GET /api/v2/bank-accounts
 */
export const getBankAccountsController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const bankAccounts = await prisma.userBankAccount.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' }, // Default accounts first
        { createdAt: 'desc' },
      ],
    });

    return new ApiResponse(200, { bankAccounts }, 'Bank accounts retrieved successfully').send(res);
  } catch (error: any) {
    console.error('Get bank accounts error:', error);
    return next(ApiError.internal(error.message || 'Failed to get bank accounts'));
  }
};

/**
 * Get bank account by ID
 * GET /api/v2/bank-accounts/:id
 */
export const getBankAccountByIdController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { id } = req.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return next(ApiError.badRequest('Invalid account ID'));
    }

    const bankAccount = await prisma.userBankAccount.findFirst({
      where: {
        id: accountId,
        userId, // Ensure user can only access their own accounts
      },
    });

    if (!bankAccount) {
      return next(ApiError.notFound('Bank account not found'));
    }

    return new ApiResponse(200, { bankAccount }, 'Bank account retrieved successfully').send(res);
  } catch (error: any) {
    console.error('Get bank account by ID error:', error);
    return next(ApiError.internal(error.message || 'Failed to get bank account'));
  }
};

/**
 * Create bank account
 * POST /api/v2/bank-accounts
 */
export const createBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }

    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { accountName, accountNumber, bankName, bankCode, isDefault } = req.body;

    // Validate required fields
    if (!accountName || !accountNumber || !bankName || !bankCode) {
      return next(ApiError.badRequest('Account name, account number, bank name, and bank code are required'));
    }

    // If this is set as default, unset other default accounts
    if (isDefault === true) {
      await prisma.userBankAccount.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const bankAccount = await prisma.userBankAccount.create({
      data: {
        userId,
        accountName,
        accountNumber,
        bankName,
        bankCode,
        isDefault: isDefault === true,
      },
    });

    return new ApiResponse(201, { bankAccount }, 'Bank account created successfully').send(res);
  } catch (error: any) {
    console.error('Create bank account error:', error);
    return next(ApiError.internal(error.message || 'Failed to create bank account'));
  }
};

/**
 * Update bank account
 * PUT /api/v2/bank-accounts/:id
 */
export const updateBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(ApiError.badRequest('Validation failed', errors.array()));
    }

    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { id } = req.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return next(ApiError.badRequest('Invalid account ID'));
    }

    // Check if account exists and belongs to user
    const existingAccount = await prisma.userBankAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!existingAccount) {
      return next(ApiError.notFound('Bank account not found'));
    }

    const { accountName, accountNumber, bankName, bankCode, isDefault } = req.body;

    // If this is set as default, unset other default accounts
    if (isDefault === true && !existingAccount.isDefault) {
      await prisma.userBankAccount.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const bankAccount = await prisma.userBankAccount.update({
      where: { id: accountId },
      data: {
        ...(accountName && { accountName }),
        ...(accountNumber && { accountNumber }),
        ...(bankName && { bankName }),
        ...(bankCode && { bankCode }),
        ...(isDefault !== undefined && { isDefault: isDefault === true }),
      },
    });

    return new ApiResponse(200, { bankAccount }, 'Bank account updated successfully').send(res);
  } catch (error: any) {
    console.error('Update bank account error:', error);
    return next(ApiError.internal(error.message || 'Failed to update bank account'));
  }
};

/**
 * Delete bank account
 * DELETE /api/v2/bank-accounts/:id
 */
export const deleteBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { id } = req.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return next(ApiError.badRequest('Invalid account ID'));
    }

    // Check if account exists and belongs to user
    const existingAccount = await prisma.userBankAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!existingAccount) {
      return next(ApiError.notFound('Bank account not found'));
    }

    await prisma.userBankAccount.delete({
      where: { id: accountId },
    });

    return new ApiResponse(200, null, 'Bank account deleted successfully').send(res);
  } catch (error: any) {
    console.error('Delete bank account error:', error);
    return next(ApiError.internal(error.message || 'Failed to delete bank account'));
  }
};

/**
 * Set default bank account
 * PUT /api/v2/bank-accounts/:id/set-default
 */
export const setDefaultBankAccountController = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).body?._user;
    const userId = user?.id;

    if (!userId) {
      return next(ApiError.unauthorized('User not authenticated'));
    }

    const { id } = req.params;
    const accountId = parseInt(id, 10);

    if (isNaN(accountId)) {
      return next(ApiError.badRequest('Invalid account ID'));
    }

    // Check if account exists and belongs to user
    const existingAccount = await prisma.userBankAccount.findFirst({
      where: {
        id: accountId,
        userId,
      },
    });

    if (!existingAccount) {
      return next(ApiError.notFound('Bank account not found'));
    }

    // Unset all other default accounts
    await prisma.userBankAccount.updateMany({
      where: { userId, isDefault: true },
      data: { isDefault: false },
    });

    // Set this account as default
    const bankAccount = await prisma.userBankAccount.update({
      where: { id: accountId },
      data: { isDefault: true },
    });

    return new ApiResponse(200, { bankAccount }, 'Default bank account updated successfully').send(res);
  } catch (error: any) {
    console.error('Set default bank account error:', error);
    return next(ApiError.internal(error.message || 'Failed to set default bank account'));
  }
};

