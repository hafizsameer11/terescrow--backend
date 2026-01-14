import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import dotenv from 'dotenv';
import ApiError from './ApiError';
import nodemailer from 'nodemailer';
import { UserRoles } from '@prisma/client';
import { prisma } from './prisma';
dotenv.config();

// Token generation
const generateToken = (userId: number, username: string, role: string) => {
  // Create a JWT token with user information
  const token = jwt.sign(
    { id: userId, username, role },
    process.env.ACCESS_TOKEN_SECRET as string,
    // {
    //   // expiresIn: process.env.ACCESS_TOKEN_EXPIRY as string,
    // }
  );
  return token;
};

// Token verification
const verifyToken = async (token: string) => {
  try {
    // const decoded = jwt.verify(
    //   token,
    //   process.env.ACCESS_TOKEN_SECRET as string
    // );
      const decoded = jwt.decode(token); // ❌ No signature check

    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Token decode failed');
    }
    // console.log(decoded);
    // console.log('Decoded token:', decoded);
    // console.log('token:', token);
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
    console.log('SMTP Settings:', smtpSettings);
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
export const sendWelcomeEmail = async (userEmail: string, firstName: string): Promise<void> => {
  try {
    // Fetch SMTP settings from the database
    const smtpSettings = await prisma.smtp.findFirst();
    console.log('SMTP Settings:', smtpSettings);

    // Setup transporter
    const transporter = nodemailer.createTransport({
      host: smtpSettings?.host || 'smtp.hostinger.com',
      port: smtpSettings?.port || 465,
      secure: true, // SSL
      auth: {
        user: smtpSettings?.email || process.env.GMAIL_USER,
        pass: smtpSettings?.password || process.env.GMAIL_PASS,
      },
    });

    const mailOptions = {
      from: smtpSettings?.email || process.env.GMAIL_USER,
      to: userEmail,
      subject: 'Welcome to Tercescrow - Let\'s Trade Giftcards Safely and Easily!',
      html: `
        <p>Hi <strong>${firstName}</strong>,</p>
        <p>Welcome to <strong>Tercescrow</strong> – your trusted platform for trading gift cards securely and conveniently!</p>
        <p>We're excited to have you on board. With Tercescrow, you can:</p>
        <ul>
          <li>Trade a wide variety of gift cards at competitive rates</li>
          <li>Enjoy fast and secure transactions</li>
          <li>Get support from our dedicated team whenever you need it</li>
        </ul>
        <p>Your journey to hassle-free gift card trading starts now.</p>
        <p>Need help? Our support team is here for you.</p>
        <br/>
        <p>Thanks for choosing Tercescrow. We're glad to have you with us!</p>
        <br/>
        <p>Warm regards,<br/>
        The Tercescrow Team<br/>
        <a href="https://www.tercescrow.io" target="_blank">www.tercescrow.io</a></p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent successfully!');
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw ApiError.internal('Failed to send Welcome Email');
  }
};

export const sendGiftCardOrderEmail = async (
  recipientEmail: string,
  orderData: {
    transactionId: number;
    productName: string;
    brandName?: string;
    countryCode?: string;
    quantity: number;
    unitPrice: number;
    currencyCode: string;
    totalAmount: number;
    fee: number;
    status: string;
    cardCode?: string;
    cardPin?: string;
    expiryDate?: Date | string | null;
    redemptionInstructions?: string | null;
    transactionCreatedTime?: string;
    senderName?: string;
  }
): Promise<void> => {
  try {
    // Fetch SMTP settings from the database
    const smtpSettings = await prisma.smtp.findFirst();

    // Setup transporter
    const transporter = nodemailer.createTransport({
      host: smtpSettings?.host || 'smtp.hostinger.com',
      port: smtpSettings?.port || 465,
      secure: true, // SSL
      auth: {
        user: smtpSettings?.email || process.env.GMAIL_USER,
        pass: smtpSettings?.password || process.env.GMAIL_PASS,
      },
    });

    // Format expiry date if available
    let expiryDateFormatted = '';
    if (orderData.expiryDate) {
      const expiry = typeof orderData.expiryDate === 'string' 
        ? new Date(orderData.expiryDate) 
        : orderData.expiryDate;
      expiryDateFormatted = expiry.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    }

    // Format transaction date
    const transactionDate = orderData.transactionCreatedTime
      ? new Date(orderData.transactionCreatedTime).toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : new Date().toLocaleString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

    // Build card details section
    let cardDetailsHtml = '';
    if (orderData.cardCode) {
      cardDetailsHtml = `
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #28a745; margin-top: 0;">Your Gift Card Details</h3>
          <p style="margin: 10px 0;"><strong>Card Code:</strong> <span style="font-family: monospace; font-size: 18px; font-weight: bold; color: #007bff;">${orderData.cardCode}</span></p>
          ${orderData.cardPin ? `<p style="margin: 10px 0;"><strong>PIN:</strong> <span style="font-family: monospace; font-size: 16px; font-weight: bold; color: #007bff;">${orderData.cardPin}</span></p>` : ''}
          ${expiryDateFormatted ? `<p style="margin: 10px 0;"><strong>Expiry Date:</strong> ${expiryDateFormatted}</p>` : ''}
        </div>
      `;
    } else {
      cardDetailsHtml = `
        <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p style="margin: 0;"><strong>Status:</strong> Your gift card is being processed. You will receive another email with your card code once it's ready.</p>
        </div>
      `;
    }

    // Build redemption instructions
    let redemptionHtml = '';
    if (orderData.redemptionInstructions) {
      redemptionHtml = `
        <div style="background-color: #e7f3ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <h4 style="margin-top: 0; color: #0056b3;">How to Redeem Your Gift Card</h4>
          <p style="margin: 0; white-space: pre-wrap;">${orderData.redemptionInstructions}</p>
        </div>
      `;
    }

    const mailOptions = {
      from: smtpSettings?.email || process.env.GMAIL_USER,
      to: recipientEmail,
      subject: `Your Gift Card Order #${orderData.transactionId} - ${orderData.productName}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #007bff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
            <h1 style="margin: 0;">🎁 Gift Card Order Confirmation</h1>
          </div>
          
          <div style="background-color: #ffffff; padding: 30px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
            <p>Hello${orderData.senderName ? ` ${orderData.senderName}` : ''},</p>
            
            <p>Thank you for your purchase! Your gift card order has been received and is being processed.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #007bff;">Order Summary</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;"><strong>Transaction ID:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right;">#${orderData.transactionId}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;"><strong>Product:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right;">${orderData.productName}${orderData.brandName ? ` (${orderData.brandName})` : ''}</td>
                </tr>
                ${orderData.countryCode ? `
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;"><strong>Country:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right;">${orderData.countryCode}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;"><strong>Quantity:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right;">${orderData.quantity}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;"><strong>Unit Price:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right;">${orderData.unitPrice} ${orderData.currencyCode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6;"><strong>Fee:</strong></td>
                  <td style="padding: 8px 0; border-bottom: 1px solid #dee2e6; text-align: right;">${orderData.fee} ${orderData.currencyCode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0;"><strong>Total Amount:</strong></td>
                  <td style="padding: 8px 0; text-align: right; font-weight: bold; color: #28a745; font-size: 18px;">${orderData.totalAmount} ${orderData.currencyCode}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-top: 1px solid #dee2e6;"><strong>Status:</strong></td>
                  <td style="padding: 8px 0; border-top: 1px solid #dee2e6; text-align: right;">
                    <span style="background-color: ${orderData.status === 'SUCCESSFUL' ? '#28a745' : orderData.status === 'PENDING' ? '#ffc107' : '#17a2b8'}; color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold;">
                      ${orderData.status}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; border-top: 1px solid #dee2e6;"><strong>Order Date:</strong></td>
                  <td style="padding: 8px 0; border-top: 1px solid #dee2e6; text-align: right;">${transactionDate}</td>
                </tr>
              </table>
            </div>
            
            ${cardDetailsHtml}
            
            ${redemptionHtml}
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 2px solid #dee2e6;">
              <p style="margin: 0; color: #6c757d; font-size: 14px;">
                <strong>Important:</strong> Please keep this email safe. Your gift card code is unique and can only be used once.
              </p>
            </div>
            
            <div style="margin-top: 30px; text-align: center;">
              <p style="margin: 0;">Need help? Contact our support team.</p>
              <p style="margin: 10px 0 0 0;">
                <a href="https://www.tercescrow.io" style="color: #007bff; text-decoration: none;">www.tercescrow.io</a>
              </p>
            </div>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #6c757d; font-size: 12px;">
            <p>This is an automated email. Please do not reply to this message.</p>
            <p>&copy; ${new Date().getFullYear()} Tercescrow. All rights reserved.</p>
          </div>
        </body>
        </html>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[GIFT CARD EMAIL] Email sent successfully to ${recipientEmail} for transaction #${orderData.transactionId}`);
  } catch (error) {
    console.error('[GIFT CARD EMAIL] Error sending gift card order email:', error);
    // Don't throw error - email failure shouldn't break the order process
    // Just log it for monitoring
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
