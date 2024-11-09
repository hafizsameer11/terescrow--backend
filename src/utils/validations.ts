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

export {
  loginValidation,
  consignorRegisterValidation,
  driverRegisterValidation,
};
