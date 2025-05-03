import path from 'path';
import multer from 'multer';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`); // Generate unique file name
  },
});

const fileFilter = (req: any, file: any, cb: any) => {
  cb(null, true); // Accept all file types
};


const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 1024 * 1024 * 100, // 0.5MB
  },
  storage: storage,
  fileFilter: fileFilter,
});

export default upload;
