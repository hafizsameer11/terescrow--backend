import { body } from 'express-validator';

const loginValidation = [
  body('email').isEmail().withMessage('Email is required'),
  body('password').isString().withMessage('Password is required'),
];

const consignorRegisterValidation = [
  body('firstname').isString().notEmpty().withMessage('First name is required'),

  body('lastname').isString().notEmpty().withMessage('Last name is required'),

  body('email').isEmail().withMessage('A valid email is required'),

  body('phoneNumber')
    .isString()
    .notEmpty()
    .withMessage('Phone number is required')
    .isLength({ min: 10, max: 15 })
    .withMessage('Phone number should be between 10 and 15 characters'),

  body('country').isString().notEmpty().withMessage('Country is required'),
  body('username').isString().notEmpty().withMessage('Username is required'),

  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long'),

  // body('confirm_password')
  //   .custom((value, { req }) => value === req.body.password)
  //   .withMessage('Passwords do not match'),

  body('gender')
    .isString()
    .isIn(['MALE', 'FEMALE', 'OTHER']) // Assuming an enum or standardized values for gender
    .withMessage('Gender must be either MALE, FEMALE, or OTHER'),
];

const driverRegisterValidation = [
  body('full_name').isString().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Email is required'),
  body('phone_number').isString().withMessage('Phone number is required'),
  body('licence_no').isString().withMessage('Licence number is required'),
  body('password').isLength({ min: 8 }).withMessage('Password is required'),
  body('confirm_password')
    .equals('password')
    .withMessage('Passwords do not match'),
];

const pinValidation = [
  body('email').isEmail().withMessage('A valid email is required'),
  body('pin')
    .isString()
    .notEmpty()
    .withMessage('PIN is required')
    .isLength({ min: 4, max: 4 })
    .withMessage('PIN must be exactly 4 digits')
    .matches(/^\d{4}$/)
    .withMessage('PIN must contain only digits'),
];

// ============================================
// Gift Card Validations
// ============================================

const giftCardPurchaseValidation = [
  body('productId')
    .isInt({ min: 1 })
    .withMessage('Valid product ID is required'),
  
  body('countryCode')
    .isString()
    .notEmpty()
    .isLength({ min: 2, max: 2 })
    .withMessage('Country code must be 2 characters (ISO code)'),
  
  body('cardType')
    .isString()
    .notEmpty()
    .isIn(['Physical', 'E-Code', 'Code Only', 'Paper Code', 'Horizontal Card'])
    .withMessage('Valid card type is required'),
  
  body('faceValue')
    .isFloat({ min: 0.01 })
    .withMessage('Face value must be a positive number'),
  
  body('quantity')
    .isInt({ min: 1, max: 10 })
    .withMessage('Quantity must be between 1 and 10'),
  
  body('currencyCode')
    .isString()
    .notEmpty()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency code must be 3 characters (ISO code)'),
  
  body('paymentMethod')
    .isString()
    .isIn(['wallet', 'card', 'bank_transfer'])
    .withMessage('Valid payment method is required'),
  
  body('recipientEmail')
    .optional()
    .isEmail()
    .withMessage('Valid recipient email is required if provided'),
  
  body('recipientPhone')
    .optional()
    .isString()
    .withMessage('Valid recipient phone is required if provided'),
  
  body('senderName')
    .optional()
    .isString()
    .withMessage('Sender name must be a string if provided'),
];

const giftCardPurchaseValidateValidation = [
  body('productId')
    .isInt({ min: 1 })
    .withMessage('Valid product ID is required'),
  
  body('countryCode')
    .isString()
    .notEmpty()
    .isLength({ min: 2, max: 2 })
    .withMessage('Country code must be 2 characters (ISO code)'),
  
  body('cardType')
    .isString()
    .notEmpty()
    .isIn(['Physical', 'E-Code', 'Code Only', 'Paper Code', 'Horizontal Card'])
    .withMessage('Valid card type is required'),
  
  body('faceValue')
    .isFloat({ min: 0.01 })
    .withMessage('Face value must be a positive number'),
  
  body('quantity')
    .isInt({ min: 1, max: 10 })
    .withMessage('Quantity must be between 1 and 10'),
  
  body('currencyCode')
    .isString()
    .notEmpty()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency code must be 3 characters (ISO code)'),
];

export {
  loginValidation,
  consignorRegisterValidation,
  driverRegisterValidation,
  pinValidation,
  giftCardPurchaseValidation,
  giftCardPurchaseValidateValidation,
};
