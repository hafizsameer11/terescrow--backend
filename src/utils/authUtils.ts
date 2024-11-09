import jwt from 'jsonwebtoken';
import bcryptjs from 'bcryptjs';
import dotenv from 'dotenv';
import ApiError from './ApiError';
dotenv.config();

// Token generation
const generateToken = (userId: number, username: string) => {
  // Create a JWT token with user information
  const token = jwt.sign(
    { _id: userId },
    process.env.ACCESS_TOKEN_SECRET as string,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY as string,
    }
  );
  return token;
};

// Token verification
const verifyToken = (token: string) => {
  try {
    const decoded = jwt.verify(token, process.env.TOKEN_KEY as string);
    return decoded as { id: number; username: string };
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

export { generateToken, verifyToken, hashPassword, comparePassword };
