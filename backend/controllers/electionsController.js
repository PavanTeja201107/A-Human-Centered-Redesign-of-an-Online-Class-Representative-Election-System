// controllers/electionsController.js
const pool = require('../config/db');
const logAction = require('../utils/logAction');
const { genToken, hashToken } = require('../utils/tokenUtils');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');

/*
 * Purpose: Create a new election with its configuration and schedule.
 * Parameters: req (express request) - expects body with class_id, nomination_start, nomination_end, voting_start, voting_end.
 *   res (express response) - used to send created election id or error.
 * Returns: JSON { message, election_id } on success.
 */
exports.createElection = async (req, res) => {
  try {
    const {
      class_id,
      nomination_start,
      nomination_end,
      voting_start,
      voting_end,
    } = req.body;
    if (
      !class_id ||
      !nomination_start ||
      !nomination_end ||
      !voting_start ||
      !voting_end
    ) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    // validate time order (strict)
    const ns = new Date(nomination_start),
      ne = new Date(nomination_end),
      vs = new Date(voting_start),
      ve = new Date(voting_end);
    if (!(ns < ne && ne < vs && vs < ve)) {
      return res
        .status(400)
        .json({
          error:
            'Invalid timeline: ensure nomination_start < nomination_end < voting_start < voting_end',
        });
    }
    // validate class exists
    const [cRows] = await pool.query(
      'SELECT 1 FROM Class WHERE class_id = ? LIMIT 1',
      [class_id]
    );
    if (!cRows.length)
      return res.status(400).json({ error: 'Class not found' });

    // enforce: no overlapping elections for the same class between nomination_start and voting_end
    const [overlaps] = await pool.query(
      `SELECT election_id FROM Election
       WHERE class_id = ?
         AND NOT (voting_end < ? OR nomination_start > ?)`,
      [class_id, nomination_start, voting_end]
    );
    if (overlaps.length) {
      return res
        .status(400)
        .json({
          error:
            'Another election overlaps this timeline for this class. Complete current election before creating a new one.',
        });
    }

    // Insert election without policy columns
    const [result] = await pool.query(
      `INSERT INTO Election (class_id, nomination_start, nomination_end, voting_start, voting_end, created_by_admin_id) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        class_id,
        nomination_start,
        nomination_end,
        voting_start,
        voting_end,
        req.user.id,
      ]
    );
    // ensure not active by default regardless of DB defaults
    await pool.query(
      'UPDATE Election SET is_active = FALSE, is_published = FALSE WHERE election_id = ?',
      [result.insertId]
    );
    await logAction(req.user.id, req.user.role, req.ip, 'CREATE_ELECTION', {
      election_id: result.insertId,
    });
    res.json({ message: 'Election created', election_id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update election details

// Helper function to calculate election status
function getElectionStatus(election) {
  const now = new Date();
  const nomStart = new Date(election.nomination_start);
  const nomEnd = new Date(election.nomination_end);
  const voteStart = new Date(election.voting_start);
  const voteEnd = new Date(election.voting_end);

  if (now < nomStart) return 'UPCOMING';
  if (now >= nomStart && now <= nomEnd) return 'NOMINATION';
  if (now > nomEnd && now < voteStart) return 'NOMINATION_CLOSED';
  if (now >= voteStart && now <= voteEnd) return 'VOTING';
  if (now > voteEnd) return 'CLOSED';

  return 'UNKNOWN';
}


/*
 * Purpose: List all elections and compute their realtime status (UPCOMING, NOMINATION, VOTING, CLOSED).
 * Parameters: req - optional query filters; res - sends array of election objects with added status.
 * Returns: JSON array of elections with status.
 */
// List all elections (admin or student)
exports.listElections = async (req, res) => {
  try {
    let query = 'SELECT * FROM Election ORDER BY created_at DESC';
    const [rows] = await pool.query(query);

    // Add status to each election
    const electionsWithStatus = rows.map((election) => ({
      ...election,
      status: getElectionStatus(election),
    }));

    res.json(electionsWithStatus);
  } catch (err) {
    console.error('listElections error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Send announcement emails to all students in the election's class when voting opens.
 * Parameters: req - expects params.id (election id); res - responds with success or error.
 * Notes: Best-effort email sending; logs errors but doesn't abort DB state changes.
 */
// Notify students when voting opens (announcement only, no tokens)
exports.notifyVotingOpen = async (req, res) => {
  try {
    const electionId = req.params.id;
    const [eRows] = await pool.query(
      'SELECT * FROM Election WHERE election_id = ?',
      [electionId]
    );
    if (!eRows.length)
      return res.status(404).json({ error: 'Election not found' });
    const election = eRows[0];

    // Do not send voting-open notifications for elections that have already ended
    const now = new Date();
    const voteStart = new Date(election.voting_start);
    const voteEnd = new Date(election.voting_end);
    if (now > voteEnd) {
      return res.status(400).json({ error: 'Voting period has already ended; notification disabled.' });
    }

    // fetch students emails in class
    const [students] = await pool.query(
      'SELECT email, name FROM Student WHERE class_id = ?',
      [election.class_id]
    );
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      return res.status(400).json({ error: 'SMTP not configured' });
    }
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
    });

    const start = new Date(election.voting_start).toLocaleString();
    const end = new Date(election.voting_end).toLocaleString();

    // naive batching
    for (const s of students) {
      if (!s.email) continue;

      await transporter.sendMail({
        from: process.env.OTP_EMAIL_FROM,
        to: s.email,
        subject: 'Voting is Now Open for the College CR Election!',
        html: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;'>
            <p>Dear <strong>${s.name || 'Student'}</strong>,</p>
            
            <p>The voting window for the <strong>College CR Election</strong> in your class is now open!</p>
            
            <div style='background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;'>
              <p style='margin: 0 0 10px 0;'><strong>🗳️ Voting Window:</strong></p>
              <ul style='margin: 0; padding-left: 20px;'>
                <li style='margin: 5px 0;'><strong>Voting Start Date/Time:</strong> ${start}</li>
                <li style='margin: 5px 0;'><strong>Voting End Date/Time (Deadline):</strong> <span style='color: #dc2626; font-weight: bold;'>${end}</span></li>
              </ul>
            </div>
            
            <p>Please log in to the College CR Election System to cast your vote before the deadline. <strong style='color: #2563eb;'>Your participation is important</strong> in selecting your Class Representative.</p>
            
            <p><strong>How to Cast Your Vote:</strong></p>
            <ol style='padding-left: 20px;'>
              <li style='margin: 8px 0;'>Log in to the College CR Election System</li>
              <li style='margin: 8px 0;'>Navigate to the voting section for your class election</li>
              <li style='margin: 8px 0;'>Review the candidates and their manifestos</li>
              <li style='margin: 8px 0;'>Accept the Voting Policy</li>
              <li style='margin: 8px 0;'>Submit your vote securely</li>
            </ol>
            
            <p style='text-align: center; margin: 20px 0;'>To Vote: Login -> Navigate to 'Vote' -> Select Candidate -> Submit Vote</p>
            
            <div style='background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;'>
              <p style='margin: 0;'><strong>💡 Your vote matters!</strong> Every eligible student is encouraged to exercise their right to vote and help choose your Class Representative.</p>
            </div>
            
            <p>If you experience any technical issues or have questions, please contact the Election Committee.</p>
            
            <hr style='border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;'>
            
            <p style='margin: 5px 0;'>Best regards,<br>
            <strong>The Election Committee</strong><br>
            College CR Election System</p>
          </div>
        `,
      });
    }
    await logAction(
      req.user.id,
      req.user.role,
      req.ip,
      'EMAIL_NOTIFICATION_SENT',
      { election_id: electionId, recipients: students.length }
    );
    res.json({ message: 'Notifications sent (if SMTP configured)' });
  } catch (err) {
    console.error('notifyVotingOpen error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Send announcement emails to students that the nomination window is open.
 * Parameters: req - expects params.id (election id); res - responds with success or error.
 * Notes: Uses SMTP configuration; will return 400 if SMTP is not configured.
 */
// Notify students when nomination opens (announcement)
exports.notifyNominationOpen = async (req, res) => {
  try {
    const electionId = req.params.id;
    const [eRows] = await pool.query(
      'SELECT * FROM Election WHERE election_id = ?',
      [electionId]
    );
    if (!eRows.length)
      return res.status(404).json({ error: 'Election not found' });
    const election = eRows[0];
    // Do not send nomination-open notifications for elections where nomination has already ended
    const now = new Date();
    const nomStart = new Date(election.nomination_start);
    const nomEnd = new Date(election.nomination_end);
    if (now > nomEnd) {
      return res.status(400).json({ error: 'Nomination period has already ended; notification disabled.' });
    }
    const [students] = await pool.query(
      'SELECT email, name FROM Student WHERE class_id = ?',
      [election.class_id]
    );
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass)
      return res.status(400).json({ error: 'SMTP not configured' });
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
    });
    const start = new Date(election.nomination_start).toLocaleString();
    const end = new Date(election.nomination_end).toLocaleString();
    for (const s of students) {
      if (!s.email) continue;

      await transporter.sendMail({
        from: process.env.OTP_EMAIL_FROM,
        to: s.email,
        subject: 'Nomination Window for College CR Election is Now Open!',
        html: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;'>
            <p>Dear <strong>${s.name || 'Student'}</strong>,</p>
            
            <p>The nomination window for the <strong>College CR Election</strong> in your class is now open!</p>
            
            <div style='background-color: #f0fdf4; border-left: 4px solid #16a34a; padding: 15px; margin: 20px 0;'>
              <p style='margin: 0 0 10px 0;'><strong>📅 Nomination Window:</strong></p>
              <ul style='margin: 0; padding-left: 20px;'>
                <li style='margin: 5px 0;'><strong>Start Date/Time:</strong> ${start}</li>
                <li style='margin: 5px 0;'><strong>End Date/Time (Deadline):</strong> <span style='color: #dc2626; font-weight: bold;'>${end}</span></li>
              </ul>
            </div>
            
            <p>If you are interested in running for Class Representative, please submit your nomination through the College CR Election System before the deadline.</p>
            
            <p><strong>How to Submit Your Nomination:</strong></p>
            <ol style='padding-left: 20px;'>
              <li style='margin: 8px 0;'>Log in to the College CR Election System</li>
              <li style='margin: 8px 0;'>Navigate to the nominations section</li>
              <li style='margin: 8px 0;'>Review and accept the Nomination Policy</li>
              <li style='margin: 8px 0;'>Complete and submit your nomination form with your manifesto</li>
            </ol>
            
            <p style='text-align: center; margin: 20px 0;'>To Nominate: Login -> Navigate to 'Nomination' -> Fill Form -> Submit</p>
            
            <p>Please ensure you meet all eligibility criteria before submitting your nomination.</p>
            
            <p>If you experience any technical issues or have questions, please contact the Election Committee.</p>
            
            <hr style='border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;'>
            
            <p style='margin: 5px 0;'>Best regards,<br>
            <strong>The Election Committee</strong><br>
            College CR Election System</p>
          </div>
        `,
      });
    }
    await logAction(
      req.user.id,
      req.user.role,
      req.ip,
      'EMAIL_NOTIFICATION_SENT',
      {
        election_id: electionId,
        type: 'NOMINATION',
        recipients: students.length,
      }
    );
    res.json({ message: 'Nomination notifications sent (if SMTP configured)' });
  } catch (err) {
    console.error('notifyNominationOpen error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Retrieve the currently active election for the logged-in student (by their class).
 * Parameters: req - authenticated student request; res - returns the active election or 404.
 * Returns: JSON election object when found.
 */
// Convenience: active election for the logged-in student based on their class
exports.getMyActiveElection = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT')
      return res.status(403).json({ error: 'Forbidden' });
    const studentId = req.user.id;
    const [sRows] = await pool.query(
      'SELECT class_id FROM Student WHERE student_id = ?',
      [studentId]
    );
    if (!sRows.length || !sRows[0].class_id)
      return res.status(404).json({ error: 'Student class not found' });
    const classId = sRows[0].class_id;
    const [rows] = await pool.query(
      `SELECT * FROM Election WHERE class_id = ? AND is_active = TRUE ORDER BY created_at DESC LIMIT 1`,
      [classId]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'No active election' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getMyActiveElection error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: List elections for the logged-in student's class and include boolean flags for nomination_open, voting_open, ended.
 * Parameters: req - authenticated student request; res - sends list of elections with computed booleans.
 * Returns: JSON array.
 */
// List all elections for the logged-in student's class with computed status flags
exports.getMyElections = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT')
      return res.status(403).json({ error: 'Forbidden' });
    const studentId = req.user.id;
    const [[s]] = await pool.query(
      'SELECT class_id FROM Student WHERE student_id = ?',
      [studentId]
    );
    if (!s || !s.class_id)
      return res.status(404).json({ error: 'Student class not found' });
    const classId = s.class_id;
    const [rows] = await pool.query(
      'SELECT * FROM Election WHERE class_id = ? ORDER BY created_at DESC',
      [classId]
    );
    const now = Date.now();
    const data = rows.map((e) => {
      const ns = new Date(e.nomination_start).getTime();
      const ne = new Date(e.nomination_end).getTime();
      const vs = new Date(e.voting_start).getTime();
      const ve = new Date(e.voting_end).getTime();
      return {
        ...e,
        nomination_open: now >= ns && now <= ne,
        voting_open: now >= vs && now <= ve,
        ended: now > ve,
      };
    });
    res.json(data);
  } catch (err) {
    console.error('getMyElections error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Return winner-certificate data for the logged-in student if they are the declared winner.
 * Parameters: req - authenticated student request; res - returns certificate payload or access error.
 * Returns: JSON object with student/class/election data for certificate rendering.
 */
exports.getMyWinnerCertificate = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'STUDENT') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const studentId = req.user.id;
    const [[student]] = await pool.query(
      `SELECT s.student_id, s.class_id, s.name, c.class_name
       FROM Student s
       LEFT JOIN Class c ON c.class_id = s.class_id
       WHERE s.student_id = ?`,
      [studentId]
    );

    if (!student || !student.class_id) {
      return res.status(404).json({ error: 'Student class not found' });
    }

    // Use the latest published, completed election for the student's class.
    const [eRows] = await pool.query(
      `SELECT e.election_id, e.voting_end, c.class_name
       FROM Election e
       JOIN Class c ON c.class_id = e.class_id
       WHERE e.class_id = ?
         AND e.is_published = TRUE
         AND e.voting_end <= NOW()
       ORDER BY e.voting_end DESC
       LIMIT 1`,
      [student.class_id]
    );

    if (!eRows.length) {
      return res.status(404).json({ error: 'Winner certificate not available yet' });
    }

    const election = eRows[0];
    const [candidateRows] = await pool.query(
      `SELECT n.student_id,
              s.name,
              COALESCE(v.votes, 0) AS votes
       FROM Nomination n
       JOIN Student s ON s.student_id = n.student_id
       LEFT JOIN (
         SELECT candidate_id, COUNT(*) AS votes
         FROM VoteAnonymous
         WHERE election_id = ?
         GROUP BY candidate_id
       ) v ON v.candidate_id = n.student_id
       WHERE n.election_id = ?
         AND n.status = 'APPROVED'
       ORDER BY votes DESC, n.student_id ASC`,
      [election.election_id, election.election_id]
    );

    if (!candidateRows.length) {
      return res.status(404).json({ error: 'Winner has not been determined yet' });
    }

    const topVotes = Number(candidateRows[0].votes || 0);
    if (topVotes <= 0) {
      return res.status(404).json({ error: 'Winner has not been determined yet' });
    }

    const topCandidates = candidateRows.filter(
      (candidate) => Number(candidate.votes || 0) === topVotes
    );

    if (topCandidates.length !== 1) {
      return res.status(409).json({ error: 'Winner is not finalized yet' });
    }

    const winner = topCandidates[0];

    if (winner.student_id !== studentId) {
      return res
        .status(403)
        .json({ error: 'You are not authorized to view this certificate.' });
    }

    await logAction(studentId, req.user.role, req.ip, 'VIEW_WINNER_CERTIFICATE', {
      election_id: election.election_id,
    });

    res.json({
      election_id: election.election_id,
      title: 'CLASS REPRESENTATIVE ELECTION',
      subtitle: 'WINNER DECLARATION CERTIFICATE',
      organization_name: process.env.CERT_ORGANIZATION_NAME || null,
      student_name: winner.name,
      student_id: winner.student_id,
      class_name: election.class_name,
      election_date: election.voting_end,
      vote_count: topVotes,
    });
  } catch (err) {
    console.error('getMyWinnerCertificate error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};


// Notify students when election results are published
/*
 * Purpose: Notify students that election results have been published and include winner summary.
 * Parameters: req - expects params.id (election id); res - returns recipients count on success.
 * Notes: For privacy, full results require login; this is an announcement email.
 */
exports.notifyResultsPublished = async (req, res) => {
  try {
    const electionId = req.params.id;
    const [eRows] = await pool.query(
      'SELECT * FROM Election WHERE election_id = ?',
      [electionId]
    );
    if (!eRows.length)
      return res.status(404).json({ error: 'Election not found' });
    const election = eRows[0];

    // Get winner information
    const [winnerRows] = await pool.query(
      `SELECT n.student_id, s.name, COUNT(v.vote_id) as vote_count
       FROM Nomination n
       LEFT JOIN Vote v ON v.nomination_id = n.nomination_id
       LEFT JOIN Student s ON s.student_id = n.student_id
       WHERE n.election_id = ?
       GROUP BY n.nomination_id, n.student_id, s.name
       ORDER BY vote_count DESC
       LIMIT 1`,
      [electionId]
    );

    if (!winnerRows.length) {
      return res
        .status(404)
        .json({ error: 'No winner found for this election' });
    }

    const winner = winnerRows[0];
    const [students] = await pool.query(
      'SELECT email, name FROM Student WHERE class_id = ?',
      [election.class_id]
    );

    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      return res.status(400).json({ error: 'SMTP not configured' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: { user, pass },
    });

    for (const s of students) {
      if (!s.email) continue;

      await transporter.sendMail({
        from: process.env.OTP_EMAIL_FROM,
        to: s.email,
        subject: `Election Results Now Available - College CR Election`,
        html: `
          <div style='font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;'>
            <p>Dear <strong>${s.name || 'Student'}</strong>,</p>
            
            <p>The results for the <strong>College CR Election</strong> (Election ID: ${electionId}) are now published!</p>
            
            <div style='background-color: #f0fdf4; border: 2px solid #16a34a; border-radius: 8px; padding: 20px; margin: 20px 0;'>
              <p style='margin: 0 0 10px 0; font-size: 18px;'><strong>🎉 Congratulations to the Winner!</strong></p>
              <p style='margin: 0; font-size: 20px; color: #16a34a; font-weight: bold;'>${winner.name}</p>
              <p style='margin: 5px 0 0 0; color: #666;'>Student ID: ${winner.student_id}</p>
            </div>
            
            <p>Thank you to all candidates who participated in this election and to everyone who exercised their right to vote. Your engagement makes our democratic process meaningful.</p>
            
            <p><strong>View Full Results:</strong></p>
            <p>You can view the complete election results, including vote counts and candidate information, by logging into the system.</p>
            <p style='text-align: center; margin: 20px 0;'>To View: Login -> Navigate to 'Results' -> Select Election</p>
            
            <p>We appreciate everyone's participation in making this election a success!</p>
            
            <hr style='border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;'>
            
            <p style='margin: 5px 0;'>Best regards,<br>
            <strong>The Election Committee</strong><br>
            College CR Election System</p>
          </div>
        `,
      });
    }

    await logAction(
      req.user.id,
      req.user.role,
      req.ip,
      'RESULTS_NOTIFICATION_SENT',
      { election_id: electionId, recipients: students.length }
    );
    res.json({
      message: 'Results notifications sent successfully',
      recipients: students.length,
    });
  } catch (err) {
    console.error('notifyResultsPublished error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Mark an election's results as published. Only allowed after voting end time.
 * Parameters: req - expects params.id (election id); res - returns success or error.
 * Returns: JSON message confirming publication.
 */
// Publish election results
exports.publishResults = async (req, res) => {
  try {
    const electionId = req.params.id;

    // Check if election exists
    const [eRows] = await pool.query(
      'SELECT * FROM Election WHERE election_id = ?',
      [electionId]
    );
    if (!eRows.length) {
      return res.status(404).json({ error: 'Election not found' });
    }

    const election = eRows[0];

    // Check if voting has ended
    const now = new Date();
    if (now < new Date(election.voting_end)) {
      return res
        .status(400)
        .json({ error: 'Cannot publish results before voting ends' });
    }

    // Update is_published flag
    await pool.query(
      'UPDATE Election SET is_published = TRUE WHERE election_id = ?',
      [electionId]
    );

    await logAction(req.user.id, req.user.role, req.ip, 'RESULTS_PUBLISHED', {
      election_id: electionId,
    });

    res.json({ message: 'Results published successfully' });
  } catch (err) {
    console.error('publishResults error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
