const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
// Nomination endpoints: students submit, admins approve/reject
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/nominationsController');

const uploadsDir = path.join(__dirname, '..', 'uploads', 'nominations');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `nom-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file || !file.mimetype) return cb(new Error('Invalid file upload'));
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

router.post(
  '/',
  verifyToken,
  requireRole('STUDENT'),
  upload.single('photo'),
  ctrl.submitNomination
);
router.get('/election/:electionId', verifyToken, ctrl.listByElection);
router.get(
  '/election/:electionId/approved',
  verifyToken,
  ctrl.listApprovedByElection
);
router.get(
  '/election/:electionId/mine',
  verifyToken,
  requireRole('STUDENT'),
  ctrl.getMyNomination
);
router.put(
  '/:id/approve',
  verifyToken,
  requireRole('ADMIN'),
  ctrl.approveNomination
);
router.put(
  '/:id/reject',
  verifyToken,
  requireRole('ADMIN'),
  ctrl.rejectNomination
);

module.exports = router;
