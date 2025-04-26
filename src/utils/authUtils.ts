import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import dotenv from 'dotenv';
import ApiError from './ApiError';
import nodemailer from 'nodemailer';
import { PrismaClient, UserRoles } from '@prisma/client';
dotenv.config();

const prisma = new PrismaClient();

// Token generation
const generateToken = (userId: number, username: string, role: string) => {
  // Create a JWT token with user information
  const token = jwt.sign(
    { id: userId, username, role },
    process.env.ACCESS_TOKEN_SECRET as string,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY as string,
    }
  );
  return token;
};

// Token verification
const verifyToken = async (token: string) => {
  try {
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as string
    );
    return decoded as {
      id: number;
      username: string;
      role: UserRoles;
    };
  } catch (error) {
    console.log(error);
    throw ApiError.unauthorized('Invalid access token');
  }
};

// Password hashing
const hashPassword = async (password: string) => {
  const saltRounds = 10; // Adjust salt rounds as needed
  const hashedPassword = await bcryptjs.hash(password, saltRounds);
  return hashedPassword;
};

// Password comparison
const comparePassword = async (password: string, hashedPassword: string) => {
  const match = await bcryptjs.compare(password, hashedPassword);
  return match;
};

// Generate a random OTP
function generateOTP(length = 4): string {
  return Math.floor(
    Math.pow(10, length - 1) + Math.random() * 9 * Math.pow(10, length - 1)
  ).toString();
}

 const sendVerificationEmail = async (
  userEmail: string,
  otp: string
): Promise<void> => {
  try {
    // Fetch SMTP settings from the database
    const smtpSettings = await prisma.smtp.findFirst();

    // Fallback to .env if no SMTP settings are found
    const transporter = nodemailer.createTransport({
      host: smtpSettings?.host || 'smtp.hostinger.com',
      port: smtpSettings?.port || 465,
      secure: true, // Use true if the encryption is SSL
      auth: {
        user: smtpSettings?.email || process.env.GMAIL_USER,
        pass: smtpSettings?.password || process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: smtpSettings?.email || process.env.GMAIL_USER,
      to: userEmail,
      subject: 'Your Verification Code',
      text: `Your OTP for verification is: ${otp}`,
    };

    await transporter.sendMail(mailOptions);
    console.log('OTP sent successfully!');
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw ApiError.internal('Failed to send OTP');
  }
};

const getAgentIdFromUserId = async (userId: number): Promise<number> => {
  const agent = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      agent: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!agent?.agent) {
    throw ApiError.notFound('Agent not found');
  }
  return agent.agent.id;
};

export {
  getAgentIdFromUserId,
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  sendVerificationEmail,
  generateOTP,
};
