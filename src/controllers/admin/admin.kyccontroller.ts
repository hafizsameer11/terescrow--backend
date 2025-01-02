import express, { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { io } from '../../socketConfig';
import { Chat, ChatStatus, ChatType, PrismaClient, TransactionStatus, User, UserRoles } from '@prisma/client';
const prisma = new PrismaClient();


export const createKycClimits = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { tier, cryptoSellLimit, cryptoBuyLimit, giftcardSellLimit, giftcardBuyLimit, } = req.body;
        console.log(req.body);
        if (!tier || !cryptoSellLimit || !cryptoBuyLimit || !giftcardSellLimit || !giftcardBuyLimit) {
            return next(ApiError.badRequest("Missing required fields"));
        }

        const kyc = await prisma.kycLimits.create({
            data: {
                tier,
                cryptoSellLimit,
                cryptoBuyLimit,
                giftCardSellLimit: giftcardSellLimit,
                giftCardBuyLimit: giftcardBuyLimit,
            },
        });
        if (!kyc) {
            return next(ApiError.badRequest("Failed to create KYC limits"));
        }
        return new ApiResponse(201, kyc, "KYC limits created successfully").send(res);

    } catch (err) {
        console.log("error", err)
        if (err instanceof ApiError) {
            return next(err);
        }

        return next(ApiError.internal("An error occurred while creating KYC limits"));
    }

}

export const getKycLimits = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const kycLimits = await prisma.kycLimits.findMany();
        return new ApiResponse(200, kycLimits, "KYC limits retrieved successfully").send(res);
    } catch (err) {
        console.log("error", err)
        return next(ApiError.internal("An error occurred while retrieving KYC limits"));
    }
}
export const updateKycLimits = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tierId = req.params.kycId;
        const { tier, cryptoSellLimit, cryptoBuyLimit, giftcardSellLimit, giftcardBuyLimit } = req.body;
        if (!tier || !cryptoSellLimit || !cryptoBuyLimit || !giftcardSellLimit || !giftcardBuyLimit) {
            return next(ApiError.badRequest("Missing required fields"));
        }
        const kycLimits = await prisma.kycLimits.update({
            where: {
                id: parseInt(tierId),
            },
            data: {
                cryptoSellLimit: cryptoSellLimit,
                cryptoBuyLimit: cryptoBuyLimit,
                giftCardSellLimit: giftcardSellLimit,
                giftCardBuyLimit: giftcardBuyLimit,
            },
        });
        if (!kycLimits) {
            return next(ApiError.badRequest("Failed to update KYC limits"));
        }
        return new ApiResponse(200, kycLimits, "KYC limits updated successfully").send(res);
    } catch (err) {
        console.log("error", err)
        if (err instanceof ApiError) {
            return next(err);
        }

        return next(ApiError.internal("An error occurred while updating KYC limits"));
    }
}


