// routes/admin.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/adminController');

// Memory-only storage for CSV uploads (no temp files on disk)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
    fileFilter: (_req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
});

// All admin-only routes
router.use(verifyToken, requireRole('ADMIN'));

// ----- Admin Profile -----
router.get('/profile', ctrl.getProfile);
router.put('/profile', ctrl.updateProfile);

// ----- Class Management -----
router.get('/classes', ctrl.listClasses);
router.post('/classes', ctrl.createClass);
router.delete('/classes/:id', ctrl.deleteClass);

// ----- Student Management -----
router.get('/students', ctrl.listStudents);
router.get('/students/:id', ctrl.getStudent);
router.post('/students', ctrl.createStudent);
router.post('/students/bulk-import', upload.single('file'), ctrl.bulkImportStudents);
router.put('/students/:id', ctrl.updateStudent);
router.delete('/students/:id', ctrl.deleteStudent);
router.post('/students/:id/reset-password', ctrl.resetStudentPassword);

module.exports = router;
