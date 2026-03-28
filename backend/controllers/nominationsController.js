// controllers/nominationsController.js
const pool = require('../config/db');
const logAction = require('../utils/logAction');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const emailStyles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    color: '#333',
  },
  approvalBox: {
    backgroundColor: '#D1FAE5',
    borderLeft: '4px solid #059669',
    padding: '15px',
    margin: '20px 0',
  },
  footer: {
    color: '#6B7280',
    fontSize: '14px',
    marginTop: '30px',
  },
};

/*
 * Purpose: Submit a nomination for the logged-in student into a given election.
 * Parameters: req - authenticated student req containing election_id, manifesto, photo_url in body.
 *   res - returns confirmation or validation error.
 * Returns: JSON message 'Nomination submitted' on success.
 */
exports.submitNomination = async (req, res) => {
  try {
    const { election_id, manifesto } = req.body;
    const studentId = req.user.id;
    const uploadedPhotoUrl = req.file
      ? `${req.protocol}://${req.get('host')}/uploads/nominations/${req.file.filename}`
      : null;
    const finalPhotoUrl = uploadedPhotoUrl || req.body.photo_url || null;
    // check nomination window
    const [eRows] = await pool.query(
      'SELECT * FROM Election WHERE election_id = ?',
      [election_id]
    );
    if (!eRows.length)
      return res.status(404).json({ error: 'Election not found' });
    const e = eRows[0];
    const now = new Date();
    if (
      now < new Date(e.nomination_start) ||
      now > new Date(e.nomination_end)
    ) {
      return res.status(400).json({ error: 'Nomination window closed' });
    }

    // ensure student belongs to the election's class
    const [[s]] = await pool.query(
      'SELECT class_id FROM Student WHERE student_id = ?',
      [studentId]
    );
    if (!s || !s.class_id)
      return res
        .status(400)
        .json({ error: 'Student not found or class not set' });
    if (s.class_id !== e.class_id)
      return res
        .status(403)
        .json({ error: 'You cannot nominate for another class election' });

    // ensure only one nomination per student per election (PENDING or APPROVED)
    const [exists] = await pool.query(
      "SELECT 1 FROM Nomination WHERE student_id = ? AND election_id = ? AND (status = 'PENDING' OR status = 'APPROVED') LIMIT 1",
      [studentId, election_id]
    );
    if (exists.length)
      return res
        .status(400)
        .json({
          error: 'You have already submitted a nomination for this election',
        });

    // ensure nomination policy accepted (per-election or globally)
    const [policyRows] = await pool.query(
      "SELECT policy_id FROM Policy WHERE name = 'Nomination Policy' LIMIT 1"
    );
    if (policyRows.length) {
      const policyId = policyRows[0].policy_id;
      const [accepted] = await pool.query(
        'SELECT 1 FROM PolicyAcceptance WHERE user_id = ? AND policy_id = ? AND election_id = ? LIMIT 1',
        [studentId, policyId, election_id]
      );
      if (!accepted.length)
        return res
          .status(403)
          .json({
            error: 'You must accept the nomination policy before submitting.',
          });
    }

    await pool.query(
      'INSERT INTO Nomination (election_id, student_id, manifesto, photo_url) VALUES (?, ?, ?, ?)',
      [election_id, studentId, manifesto, finalPhotoUrl]
    );
    await logAction(studentId, req.user.role, req.ip, 'NOMINATION_SUBMITTED', {
      election_id,
    });
    res.json({ message: 'Nomination submitted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: List all nominations for a specific election (admin view).
 * Parameters: req - expects params.electionId; res - returns array of nominations.
 * Returns: JSON array of nomination records.
 */
exports.listByElection = async (req, res) => {
  const electionId = req.params.electionId;
  try {
    const [rows] = await pool.query(
      'SELECT * FROM Nomination WHERE election_id = ?',
      [electionId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: List only nominations that are APPROVED for use in the voting UI.
 * Parameters: req - expects params.electionId; res - returns array of approved nominations.
 * Returns: JSON array of approved nominations including candidate name.
 */
// list only approved nominations for a given election (for voting UI)
exports.listApprovedByElection = async (req, res) => {
  const electionId = req.params.electionId;
  try {
    const [rows] = await pool.query(
      `SELECT n.nomination_id, n.election_id, n.student_id, n.manifesto, n.photo_url, s.name
       FROM Nomination n
       JOIN Student s ON s.student_id = n.student_id
       WHERE n.election_id = ? AND n.status = 'APPROVED'`,
      [electionId]
    );
    res.json(rows);
  } catch (err) {
    console.error('listApprovedByElection error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Retrieve the current authenticated student's nomination for a specific election (if any).
 * Parameters: req - expects params.electionId; res - returns nomination object or null.
 * Returns: nomination object or null.
 */
// get current student's nomination (if any) for an election
exports.getMyNomination = async (req, res) => {
  try {
    const electionId = req.params.electionId;
    const studentId = req.user.id;
    const [rows] = await pool.query(
      'SELECT * FROM Nomination WHERE election_id = ? AND student_id = ? LIMIT 1',
      [electionId, studentId]
    );
    if (!rows.length) return res.json(null);
    res.json(rows[0]);
  } catch (err) {
    console.error('getMyNomination error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Approve a pending nomination. Validates timing and updates nomination status, then emails the student.
 * Parameters: req - expects params.id (nomination id); res - returns confirmation.
 * Returns: JSON message 'Nomination approved and student notified' on success.
 */
exports.approveNomination = async (req, res) => {
  const id = req.params.id;
  try {
    // Get nomination details before updating
    const [nomRows] = await pool.query(
      'SELECT n.*, s.name, s.email, e.class_id, e.voting_start, e.election_id FROM Nomination n JOIN Student s ON s.student_id = n.student_id JOIN Election e ON e.election_id = n.election_id WHERE n.nomination_id = ?',
      [id]
    );
    if (!nomRows.length) {
      return res.status(404).json({ error: 'Nomination not found' });
    }
    const nomination = nomRows[0];

    // Check if voting has already started
    const now = new Date();
    const votingStart = new Date(nomination.voting_start);
    if (now >= votingStart) {
      return res
        .status(400)
        .json({ error: 'Cannot approve nomination after voting has started' });
    }

    // Only allow transition from PENDING -> APPROVED
    const [result] = await pool.query(
      "UPDATE Nomination SET status = 'APPROVED', reviewed_by_admin_id = ?, reviewed_at = NOW() WHERE nomination_id = ? AND status = 'PENDING'",
      [req.user.id, id]
    );
    if (result.affectedRows === 0) {
      return res
        .status(400)
        .json({ error: 'Decision already made or nomination not found' });
    }

    // Send approval email to student
    try {
      await transporter.sendMail({
        from: process.env.OTP_EMAIL_FROM,
        to: nomination.email,
        subject: 'Nomination Approved - College CR Election System',
        html: `
          <div style="${Object.entries(emailStyles.container).map(([key, value]) => `${key}: ${value}`).join('; ')}">
            <h2 style="color: #059669;">Nomination Approved!</h2>
            <p>Dear ${nomination.name},</p>
            <p>Congratulations! We are pleased to inform you that your nomination for the CR election has been <strong>approved</strong>.</p>
            <div style="${Object.entries(emailStyles.approvalBox).map(([key, value]) => `${key}: ${value}`).join('; ')}">
              <p style="margin: 0; font-weight: bold; color: #065F46;">✔ Your nomination is now approved</p>
              <p style="margin: 10px 0 0 0; color: #047857;">You are now officially a candidate for the Class ${nomination.class_id} CR election.</p>
            </div>
            <p><strong>Next Steps:</strong></p>
            <ul style="color: #374151;">
              <li>Your name will appear on the ballot when voting begins</li>
              <li>Students will be able to view your manifesto</li>
              <li>Monitor your nomination status in your dashboard</li>
            </ul>
            <p>Good luck with your campaign!</p>
            <p style="${Object.entries(emailStyles.footer).map(([key, value]) => `${key}: ${value}`).join('; ')}">
              This is an automated email from the College CR Election System.
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Failed to send approval email:', emailErr);
      // Don't fail the approval if email fails
    }

    await logAction(req.user.id, req.user.role, req.ip, 'NOMINATION_APPROVE', {
      nomination_id: id,
    });
    res.json({ message: 'Nomination approved and student notified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Reject a pending nomination with a provided reason. Updates status and notifies the student.
 * Parameters: req - expects params.id and body.reason; res - returns confirmation.
 * Returns: JSON message 'Nomination rejected and student notified' on success.
 */
exports.rejectNomination = async (req, res) => {
  const id = req.params.id;
  const { reason } = req.body;
  try {
    // Validate reason is provided
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    // Get nomination details before updating
    const [nomRows] = await pool.query(
      "SELECT n.*, s.name, s.email, e.voting_start FROM Nomination n JOIN Student s ON s.student_id = n.student_id JOIN Election e ON e.election_id = n.election_id WHERE n.nomination_id = ?",
      [id]
    );
    if (!nomRows.length) {
      return res.status(404).json({ error: 'Nomination not found' });
    }
    const nomination = nomRows[0];

    // Check if voting has already started
    const now = new Date();
    const votingStart = new Date(nomination.voting_start);
    if (now >= votingStart) {
      return res
        .status(400)
        .json({ error: 'Cannot reject nomination after voting has started' });
    }

    // Only allow transition from PENDING -> REJECTED
    const [result] = await pool.query(
      "UPDATE Nomination SET status = 'REJECTED', reviewed_by_admin_id = ?, reviewed_at = NOW(), rejection_reason = ? WHERE nomination_id = ? AND status = 'PENDING'",
      [req.user.id, reason, id]
    );
    if (result.affectedRows === 0) {
      return res
        .status(400)
        .json({ error: 'Decision already made or nomination not found' });
    }

    // Send rejection email to student
    try {
      await transporter.sendMail({
        from: process.env.OTP_EMAIL_FROM,
        to: nomination.email,
        subject: 'Nomination Status Update - College CR Election System',
        html: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;'>
            <h2 style='color: #DC2626;'>Nomination Rejected</h2>
            <p>Dear ${nomination.name},</p>
            <p>We regret to inform you that your nomination for the CR election has been rejected.</p>
            
            <div style='background-color: #FEE2E2; border-left: 4px solid #DC2626; padding: 15px; margin: 20px 0;'>
              <p style='margin: 0; font-weight: bold; color: #991B1B;'>Reason for Rejection:</p>
              <p style='margin: 10px 0 0 0; color: #7F1D1D;'>${reason}</p>
            </div>
            
            <p>If you have any questions, please contact the election administrators.</p>
            
            <p style='color: #6B7280; font-size: 14px; margin-top: 30px;'>
              This is an automated email from the College CR Election System.
            </p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error('Failed to send rejection email:', emailErr);
      // Don't fail the rejection if email fails
    }

    await logAction(req.user.id, req.user.role, req.ip, 'NOMINATION_REJECT', {
      nomination_id: id,
      reason,
    });
    res.json({ message: 'Nomination rejected and student notified' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
