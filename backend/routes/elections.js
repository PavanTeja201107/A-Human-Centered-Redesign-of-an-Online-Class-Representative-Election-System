const express = require('express');
const router = express.Router();
// Election management and student convenience endpoints. Protected by auth middleware.
const { verifyToken, requireRole } = require('../middleware/auth');
const ctrl = require('../controllers/electionsController');

// Creation and listing
router.post('/', verifyToken, requireRole('ADMIN'), ctrl.createElection);
router.get('/', verifyToken, ctrl.listElections);

// Student convenience routes MUST be before generic :id routes
router.get(
  '/my/active',
  verifyToken,
  requireRole('STUDENT'),
  ctrl.getMyActiveElection
);
router.get('/my', verifyToken, requireRole('STUDENT'), ctrl.getMyElections);
router.get(
  '/my/winner-certificate',
  verifyToken,
  requireRole('STUDENT'),
  ctrl.getMyWinnerCertificate
);

// Removed unused class-scoped and id-based admin actions (activate/publish/update/get)
router.post(
  '/:id/notify',
  verifyToken,
  requireRole('ADMIN'),
  ctrl.notifyVotingOpen
);
router.post(
  '/:id/notify/nomination-open',
  verifyToken,
  requireRole('ADMIN'),
  ctrl.notifyNominationOpen
);
router.post(
  '/:id/notify/results-published',
  verifyToken,
  requireRole('ADMIN'),
  ctrl.notifyResultsPublished
);
router.put(
  '/:id/publish',
  verifyToken,
  requireRole('ADMIN'),
  ctrl.publishResults
);

/*
 * Bulk operations
 * Removed unused bulk publish (automation handles publishing)
 */

module.exports = router;
