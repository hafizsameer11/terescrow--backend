import express, { NextFunction, Request, Response } from 'express';
import ApiError from '../../utils/ApiError';
import ApiResponse from '../../utils/ApiResponse';
import { io } from '../../socketConfig';
import { Chat, ChatStatus, ChatType, PrismaClient, TransactionStatus, User, UserRoles } from '@prisma/client';
const prisma = new PrismaClient();
export const updateSmtp = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { host, from, email, port, password, encryption } = req.body;

        // Log the request body for debugging
        console.log(req.body);

        // Check if all required fields are present
        if (!host || !from || !email || !port || !password || !encryption) {
            return next(ApiError.badRequest("Missing required fields"));
        }

        // Find the first record in the SMTP table
        let smtp = await prisma.smtp.findFirst();

        if (smtp) {
            // Update the existing record
            smtp = await prisma.smtp.update({
                where: { id: smtp.id },
                data: {
                    host,
                    from,
                    email,
                    port: Number(port), // Ensure the port is stored as a number
                    password,
                    encryption,
                },
            });
        } else {
            // Create a new record if none exists
            smtp = await prisma.smtp.create({
                data: {
                    host,
                    from,
                    email,
                    port: Number(port),
                    password,
                    encryption,
                },
            });
        }

        // Return success response
        return new ApiResponse(200, smtp, "SMTP configuration saved successfully").send(res);
    } catch (err) {
        console.log("Error updating/creating SMTP:", err);

        // Handle API-specific errors
        if (err instanceof ApiError) {
            return next(err);
        }

        // Handle other internal errors
        return next(ApiError.internal("An error occurred while saving SMTP configuration"));
    }
};
export const getSmtpDetails = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Fetch the first SMTP record
        const smtp = await prisma.smtp.findFirst();

        // If no record exists, return a not found response
        if (!smtp) {
            return next(ApiError.notFound("No SMTP configuration found"));
        }

        // Return the SMTP details
        return new ApiResponse(200, smtp, "SMTP configuration retrieved successfully").send(res);
    } catch (err) {
        console.log("Error fetching SMTP details:", err);

        // Handle API-specific errors
        if (err instanceof ApiError) {
            return next(err);
        }

        // Handle other internal errors
        return next(ApiError.internal("An error occurred while retrieving SMTP configuration"));
    }
};
