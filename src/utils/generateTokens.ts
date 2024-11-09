// const User = require('../models/user');

// const generateAccessTokenandRefreshToken = async (userId) => {
//   const user = await User.findById(userId);

//   const accessToken = user.generateAccessToken();
//   const refreshToken = user.generateRefreshToken();

//   user.refreshToken = refreshToken;
//   await user.save({ validateBeforeSave: false });

//   return { accessToken, refreshToken };
// };

// module.exports = generateAccessTokenandRefreshToken;
