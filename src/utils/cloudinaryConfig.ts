// const cloudinary = require('cloudinary').v2;
// const { CloudinaryStorage } = require('multer-storage-cloudinary');
// require('dotenv').config();

// // Configure Cloudinary
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
// });

// // Set up Cloudinary storage engine with multer
// const storage = new CloudinaryStorage({
//   cloudinary: cloudinary,
//   params: {
//     folder: 'uploads', // Folder in Cloudinary where files will be stored
//     format: async (req, file) => 'png', // Format can be 'jpeg', 'png', etc.
//     public_id: (req, file) => Date.now(), // Unique filename
//   },
// });

// module.exports = storage;
