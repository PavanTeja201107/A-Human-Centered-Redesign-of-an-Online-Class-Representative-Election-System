// controllers/adminController.js
const pool = require('../config/db');
const bcrypt = require('bcrypt');
const logAction = require('../utils/logAction');
const nodemailer = require('nodemailer');

// Reusable email styles
const emailStyles = {
  container: {
    fontFamily: 'Arial, sans-serif',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '20px',
    color: '#333',
  },
  impactBox: {
    backgroundColor: '#fef2f2',
    borderLeft: '4px solid #dc2626',
    padding: '15px',
    margin: '20px 0',
  },
  infoBox: {
    backgroundColor: '#f3f4f6',
    borderLeft: '4px solid #2563eb',
    padding: '15px',
    margin: '20px 0',
  },
  warningBox: {
    backgroundColor: '#fef3c7',
    borderLeft: '4px solid #f59e0b',
    padding: '15px',
    margin: '20px 0',
  },
  hr: {
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    margin: '20px 0',
  },
};

const normalizeValue = (v) => String(v || '').trim().toLowerCase();

const styleToInline = (styleObj) =>
  Object.entries(styleObj)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');

const buildStudentWelcomeEmailHtml = ({
  name,
  email,
  class_id,
  date_of_birth,
  student_id,
  defaultPassword,
}) => {
  const supportEmail =
    process.env.SUPPORT_EMAIL ||
    process.env.OTP_EMAIL_FROM ||
    process.env.SMTP_USER ||
    'support@example.com';

  return `
    <div style="${styleToInline(emailStyles.container)}">
      <p>Dear <strong>${name}</strong>,</p>

      <p>Welcome to the <strong>College CR Election System</strong>!</p>

      <p>Your student account has been successfully created. Below are your login credentials and profile details:</p>

      <div style="${styleToInline(emailStyles.infoBox)}">
        <p style="margin: 0 0 10px 0;"><strong>Login Credentials:</strong></p>
        <ul style="margin: 0; padding-left: 20px;">
          <li style="margin: 5px 0;"><strong>Student ID:</strong> <span style="font-size: 16px; color: #2563eb; font-weight: bold;">${student_id}</span></li>
          <li style="margin: 5px 0;"><strong>Default Password:</strong> <span style="font-size: 16px; color: #2563eb; font-weight: bold;">${defaultPassword}</span></li>
        </ul>
      </div>

      <p><strong>Profile Information:</strong></p>
      <ul style="padding-left: 20px;">
        <li style="margin: 5px 0;">Full Name: ${name}</li>
        <li style="margin: 5px 0;">Email: ${email}</li>
        <li style="margin: 5px 0;">Class ID: ${class_id}</li>
        <li style="margin: 5px 0;">Date of Birth: ${date_of_birth}</li>
      </ul>

      <div style="${styleToInline(emailStyles.warningBox)}">
        <p style="margin: 0 0 10px 0;"><strong>Important Security Instructions:</strong></p>
        <p style="margin: 0;">For your account security, you must <strong>change your password upon first login</strong>. Using a strong, unique password helps protect your personal information and ensures the integrity of the election process.</p>
      </div>

      <p><strong>Next Steps:</strong></p>
      <ol style="padding-left: 20px;">
        <li style="margin: 8px 0;">Log in to the system using your <strong>Student ID</strong> and <strong>Default Password</strong></li>
        <li style="margin: 8px 0;"><strong>Change your password immediately</strong></li>
        <li style="margin: 8px 0;">Review your profile information for accuracy</li>
        <li style="margin: 8px 0;">Familiarize yourself with the election system</li>
      </ol>

      <p style="text-align: center; margin: 20px 0;">Action Required: Login to System -> Complete Initial Setup</p>

      <p>If you notice any incorrect information in your profile or have questions about using the system, please contact our support team at <a href="mailto:${supportEmail}" style="color: #2563eb;">${supportEmail}</a>.</p>

      <p>Thank you for participating in the College CR Election System.</p>

      <hr style="${styleToInline(emailStyles.hr)}">

      <p style="margin: 5px 0;">Best regards,<br>
      <strong>The Election Committee</strong><br>
      College CR Election System</p>
    </div>
  `;
};

// =============== ADMIN PROFILE ===============
/*
 * Purpose: Retrieve the current admin's profile information.
 * Parameters: req - authenticated request with req.user.adminId.
 *   res - response object to send profile JSON.
 * Returns: JSON with admin profile data on success.
 */
exports.getProfile = async (req, res) => {
  try {
    const adminId = req.user.id;
    const [rows] = await pool.query(
      'SELECT admin_id, name, email, created_at FROM Admin WHERE admin_id = ?',
      [adminId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Admin not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getProfile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};


/*
 * Purpose: Update the admin's profile information (name, email, etc.).
 * Parameters: req - authenticated request containing updated fields in body.
 *   res - response with updated profile or error.
 * Returns: JSON confirming update and returning new profile.
 */
exports.updateProfile = async (req, res) => {
  try {
    const adminId = req.user.id;
    const { name, email } = req.body;
    if (!name && !email)
      return res.status(400).json({ error: 'No fields provided' });

    await pool.query(
      'UPDATE Admin SET name = COALESCE(?, name), email = COALESCE(?, email) WHERE admin_id = ?',
      [name, email, adminId]
    );
    await logAction(adminId, req.user.role, req.ip, 'ADMIN_PROFILE_UPDATE', {
      name,
      email,
    });
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// =============== CLASS MANAGEMENT ===============
/*
 * Purpose: List all classes available to the admin.
 * Parameters: req - request object; res - response to send classes list.
 * Returns: JSON array of class records.
 */
exports.listClasses = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM Class ORDER BY class_id');
    res.json(rows);
  } catch (err) {
    console.error('listClasses error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Create a new class record in the system.
 * Parameters: req - expects body.name and other class metadata.
 *   res - returns created class record.
 * Returns: JSON of the newly created class.
 */
exports.createClass = async (req, res) => {
  try {
    const { class_name } = req.body;
    if (!class_name)
      return res.status(400).json({ error: 'class_name required' });

    const [result] = await pool.query(
      'INSERT INTO Class (class_name) VALUES (?)',
      [class_name]
    );
    await logAction(req.user.id, req.user.role, req.ip, 'CLASS_CREATED', {
      class_id: result.insertId,
    });
    res.json({ message: 'Class created', class_id: result.insertId });
  } catch (err) {
    console.error('createClass error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Delete a class by id. This performs a cascade delete where applicable.
 * Parameters: req - expects params.classId.
 *   res - returns success message or error if constraints prevent deletion.
 * Returns: JSON message confirming deletion.
 */
exports.deleteClass = async (req, res) => {
  let conn;
  try {
    const id = req.params.id;
    const force =
      String(req.query.force || '').toLowerCase() === 'true' ||
      req.query.force === '1';

    conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Check if class exists first
      const [classRows] = await conn.query(
        'SELECT class_id, class_name FROM Class WHERE class_id = ?',
        [id]
      );

      if (classRows.length === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Class not found' });
      }

      const [studentsRows] = await conn.query(
        'SELECT student_id, email, name FROM Student WHERE class_id = ?',
        [id]
      );
      const studentsCount = studentsRows.length;

      if (studentsCount > 0 && !force) {
        await conn.rollback();
        return res.status(400).json({
          error:
            'Class has enrolled students. Re-run with force=true to delete class, its students, and all related elections, nominations and votes. Notifications will be sent to enrolled students.',
        });
      }

      const studentIds = studentsRows.map((s) => s.student_id);

      // Pre-clean tables that do not have FK cascades to Student
      if (studentIds.length) {
        const placeholders = studentIds.map(() => '?').join(',');
        await conn.query(
          `DELETE FROM PolicyAcceptance WHERE user_role='STUDENT' AND user_id IN (${placeholders})`,
          studentIds
        );
        await conn.query(
          `DELETE FROM Session WHERE role='STUDENT' AND user_id IN (${placeholders})`,
          studentIds
        );
        await conn.query(
          `DELETE FROM OTP WHERE user_role='STUDENT' AND user_id IN (${placeholders})`,
          studentIds
        );
      }

      // Deleting the class will CASCADE to Student, Election, Nomination, VotingToken, VoterStatus, VoteAnonymous as per schema
      const [delRes] = await conn.query(
        'DELETE FROM Class WHERE class_id = ?',
        [id]
      );

      if (delRes.affectedRows === 0) {
        await conn.rollback();
        return res.status(404).json({ error: 'Class not found' });
      }

      await logAction(req.user.id, req.user.role, req.ip, 'CLASS_DELETED', {
        class_id: id,
        force,
        students_removed: studentsCount,
      });
      await conn.commit();

      // Send response first
      res.json({
        message: 'Class deleted successfully',
        studentsRemoved: studentsCount,
        force,
      });

      // Notify affected students by email (best-effort, after response)
      // This runs asynchronously after the response is sent
      if (studentsRows.length) {
        setImmediate(async () => {
          try {
            const host = process.env.SMTP_HOST;
            const port = parseInt(process.env.SMTP_PORT || '587');
            const user = process.env.SMTP_USER;
            const pass = process.env.SMTP_PASS;
            if (host && user && pass) {
              const transporter = nodemailer.createTransport({
                host,
                port,
                secure: false,
                auth: { user, pass },
              });
              for (const s of studentsRows) {
                if (!s.email) continue;
                const text = `
                  <div style="${Object.entries(emailStyles.container).map(([key, value]) => `${key}: ${value}`).join('; ')}">
                    <p>Dear <strong>${s.name || s.student_id}</strong>,</p>
                    
                    <p>We are writing to inform you that your class (Class ID: <strong style="color: #dc2626;">${id}</strong>) has been removed from the <strong>College CR Election System</strong> by an administrator.</p>
                    
                    <p>As a result of this action, the following data associated with your class has been permanently deleted:</p>
                    
                    <div style="${Object.entries(emailStyles.impactBox).map(([key, value]) => `${key}: ${value}`).join('; ')}">
                      <p style="margin: 0 0 10px 0;"><strong>⚠️ Impact on Your Account and Data:</strong></p>
                      <ul style="margin: 0; padding-left: 20px;">
                        <li style="margin: 5px 0;"><strong>Student accounts</strong> for this class have been deleted</li>
                        <li style="margin: 5px 0;"><strong>All elections</strong> associated with this class have been removed</li>
                        <li style="margin: 5px 0;"><strong>Nomination records</strong> for this class have been deleted</li>
                        <li style="margin: 5px 0;"><strong>Voting records</strong> for this class have been deleted</li>
                        <li style="margin: 5px 0;"><strong>Class information</strong> and related data have been removed from the system</li>
                      </ul>
                    </div>
                    
                    <p>If you believe this action was taken in error or if you have any questions, please contact the system administrator immediately at <a href="mailto:[Admin Contact Email]" style="color: #2563eb;">[Admin Contact Email]</a>.</p>
                    
                    <hr style="${Object.entries(emailStyles.hr).map(([key, value]) => `${key}: ${value}`).join('; ')}">
                    
                    <p style="margin: 5px 0;">Best regards,<br>
                    <strong>The Election Committee</strong><br>
                    College CR Election System</p>
                  </div>
                `;
                await transporter.sendMail({
                  from: process.env.OTP_EMAIL_FROM,
                  to: s.email,
                  subject:
                    'Important Notice: Your Class Has Been Removed from the College CR Election System',
                  html: text,
                });
              }
            }
          } catch (mailErr) {
            console.error(
              'deleteClass notification email error:',
              mailErr && mailErr.message ? mailErr.message : mailErr
            );
          }
        });
      }
    } catch (txErr) {
      try {
        await conn.rollback();
      } catch (_) { }
      throw txErr;
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    console.error('deleteClass error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Server error: ' + (err.message || 'Unknown error') });
    }
  }
};

// =============== STUDENT MANAGEMENT ===============
/*
 * Purpose: List students with optional filters (class, search, pagination).
 * Parameters: req - may contain query parameters for filtering.
 *   res - returns paginated students list.
 * Returns: JSON with students array and pagination metadata.
 */
exports.listStudents = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT student_id, name, email, class_id, must_change_password, created_at FROM Student'
    );
    res.json(rows);
  } catch (err) {
    console.error('listStudents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getStudent = async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query(
      'SELECT * FROM Student WHERE student_id = ?',
      [id]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Student not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('getStudent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Create a new student account and send a welcome email with instructions.
 * Parameters: req - expects body with student details (student_id, name, email, class_id).
 *   res - returns created student record.
 * Returns: JSON of the created student.
 */
exports.createStudent = async (req, res) => {
  try {
    const { name, email, date_of_birth, class_id } = req.body;
    if (!name || !email || !date_of_birth || !class_id) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Gmail-only email enforcement
    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    if (!gmailRegex.test(String(email))) {
      return res
        .status(400)
        .json({
          error: 'Only Gmail addresses are supported (example@gmail.com)',
        });
    }

    // Validate DOB format
    const [yyyy, mm, dd] = (date_of_birth || '').split('-');
    if (!yyyy || !mm || !dd)
      return res
        .status(400)
        .json({ error: 'Invalid date_of_birth format (YYYY-MM-DD)' });

    /*
     * Always auto-generate student_id in the format: CL{classId(>=2 digits)}S{4-digit sequence}
     * - Example: class_id=1 -> CL01S0001, class_id=12 -> CL12S0001
     * - Guarantees uniqueness by picking the smallest available 4-digit suffix not in use for the class
     */
    const conn = await pool.getConnection();
    let student_id;
    let defaultPassword;
    try {
      await conn.beginTransaction();

      // Ensure class exists for clearer error (optional but user-friendly)
      const [classRows] = await conn.query(
        'SELECT 1 FROM Class WHERE class_id = ? LIMIT 1',
        [class_id]
      );
      if (!classRows.length) {
        await conn.rollback();
        conn.release();
        return res.status(400).json({ error: 'Invalid class_id' });
      }

      // Duplicate validations
      const normalizedName = normalizeValue(name);
      const normalizedEmail = normalizeValue(email);

      const [dupNameRows] = await conn.query(
        'SELECT student_id FROM Student WHERE class_id = ? AND LOWER(TRIM(name)) = ? LIMIT 1 FOR UPDATE',
        [class_id, normalizedName]
      );
      if (dupNameRows.length) {
        await conn.rollback();
        conn.release();
        return res.status(409).json({ error: 'Duplicate name in selected class' });
      }

      const [dupEmailRows] = await conn.query(
        'SELECT student_id FROM Student WHERE LOWER(TRIM(email)) = ? LIMIT 1 FOR UPDATE',
        [normalizedEmail]
      );
      if (dupEmailRows.length) {
        await conn.rollback();
        conn.release();
        return res.status(409).json({ error: 'Duplicate email' });
      }

      /*
       * Lock rows for this class to avoid race conditions and find the max suffix used so far
       * Lock all existing students for this class to compute the smallest available suffix safely
       */
      const [existingRows] = await conn.query(
        'SELECT student_id FROM Student WHERE class_id = ? FOR UPDATE',
        [class_id]
      );

      const used = new Set();
      for (const r of existingRows) {
        const id = String(r.student_id || '');
        // New format: CL{classId}S{suffix}
        const m = /CL\d+S(\d{1,})$/.exec(id);
        if (m && m[1]) {
          const n = parseInt(m[1], 10);
          if (!isNaN(n)) {
            used.add(n);
            continue;
          }
        }
        // Legacy format: {classId}_{suffix} (e.g., 1_0001)
        const legacy = /^(\d+)_([0-9]{1,})$/.exec(id);
        if (legacy && legacy[2]) {
          const n2 = parseInt(legacy[2], 10);
          if (!isNaN(n2)) used.add(n2);
        }
      }

      const classPart = String(class_id).padStart(2, '0');
      let candidate = 1;
      let attempts = 0;
      const maxAttempts = 2000; // safety cap
      // Default password rule: ddmmyyyy
      defaultPassword = `${dd}${mm}${yyyy}`.toLowerCase();
      const hash = await bcrypt.hash(defaultPassword, 10);

      while (attempts < maxAttempts) {
        // find smallest unused
        while (used.has(candidate)) candidate += 1;
        const suffix = String(candidate).padStart(4, '0');
        student_id = `CL${classPart}S${suffix}`;
        try {
          await conn.query(
            'INSERT INTO Student (student_id, name, email, date_of_birth, class_id, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [student_id, name, email, date_of_birth, class_id, hash, true]
          );
          // success
          break;
        } catch (e) {
          if (e && e.code === 'ER_DUP_ENTRY') {
            // mark this candidate as used and try next
            used.add(candidate);
            candidate += 1;
            attempts += 1;
            continue;
          }
          throw e;
        }
      }

      if (!student_id) {
        await conn.rollback();
        conn.release();
        return res
          .status(409)
          .json({
            error: 'Failed to generate a unique Student ID. Please retry.',
          });
      }

      await logAction(req.user.id, req.user.role, req.ip, 'STUDENT_CREATED', {
        student_id,
        auto: true,
      });
      await conn.commit();
      conn.release();
    } catch (txErr) {
      try {
        await conn.rollback();
      } catch (_) { }
      conn.release();
      throw txErr;
    }

    // Attempt to send welcome email with credentials (best-effort, outside transaction)
    try {
      const host = process.env.SMTP_HOST;
      const port = parseInt(process.env.SMTP_PORT || '587');
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;
      if (host && user && pass) {
        const transporter = nodemailer.createTransport({
          host,
          port,
          secure: false,
          auth: { user, pass },
        });
        const subject =
          'Welcome to the College CR Election System - Your Account Details';
        const html = buildStudentWelcomeEmailHtml({
          name,
          email,
          class_id,
          date_of_birth,
          student_id,
          defaultPassword,
        });
        await transporter.sendMail({
          from: process.env.OTP_EMAIL_FROM,
          to: email,
          subject,
          html,
        });
      }
    } catch (mailErr) {
      console.error(
        'createStudent welcome email error:',
        mailErr && mailErr.message ? mailErr.message : mailErr
      );
    }

    res.json({
      message: 'Student created successfully',
      defaultPassword,

      student_id,
    });
  } catch (err) {
    console.error('createStudent error:', err);
    if (err && err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid class_id' });
    }
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Update an existing student's record.
 * Parameters: req - expects params.studentId and body with fields to update.
 *   res - returns updated student record.
 * Returns: JSON of the updated student.
 */
exports.updateStudent = async (req, res) => {
  try {
    const id = req.params.id;
    const { name, email, class_id } = req.body;
    if (email) {
      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
      if (!gmailRegex.test(String(email))) {
        return res
          .status(400)
          .json({
            error: 'Only Gmail addresses are supported (example@gmail.com)',
          });
      }
    }
    await pool.query(
      'UPDATE Student SET name = COALESCE(?, name), email = COALESCE(?, email), class_id = COALESCE(?, class_id) WHERE student_id = ?',
      [name, email, class_id, id]
    );
    await logAction(req.user.id, req.user.role, req.ip, 'STUDENT_UPDATED', {
      student_id: id,
    });
    res.json({ message: 'Student updated successfully' });
  } catch (err) {
    console.error('updateStudent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Delete a student account permanently.
 * Parameters: req - expects params.studentId.
 *   res - returns success or error message.
 * Returns: JSON message confirming deletion.
 */
exports.deleteStudent = async (req, res) => {
  try {
    const id = req.params.id;
    await pool.query('DELETE FROM Student WHERE student_id = ?', [id]);
    await logAction(req.user.id, req.user.role, req.ip, 'STUDENT_DELETED', {
      student_id: id,
    });
    res.json({ message: 'Student deleted successfully' });
  } catch (err) {
    console.error('deleteStudent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

/*
 * Purpose: Reset a student's password and email them a temporary password or OTP.
 * Parameters: req - expects params.studentId.
 * res - returns confirmation that reset communication was sent.
 * Returns: JSON message 'Password reset sent' on success.
 */
exports.resetStudentPassword = async (req, res) => {
  try {
    const id = req.params.id;
    const [rows] = await pool.query(
      'SELECT date_of_birth, student_id FROM Student WHERE student_id = ?',
      [id]
    );
    if (!rows.length)
      return res.status(404).json({ error: 'Student not found' });
    const dob = rows[0].date_of_birth;
    let tempPassword;
    if (dob) {
      const yyyy = String(dob).slice(0, 4);
      const mm = String(dob).slice(5, 7);
      const dd = String(dob).slice(8, 10);
      tempPassword = `${dd}${mm}${yyyy}`.toLowerCase();
    } else {
      // fallback temp
      tempPassword = 'reset' + Math.floor(1000 + Math.random() * 9000);
    }
    const hash = await bcrypt.hash(tempPassword, 10);
    await pool.query(
      'UPDATE Student SET password_hash=?, must_change_password=TRUE WHERE student_id=?',
      [hash, id]
    );
    await logAction(
      req.user.id,
      req.user.role,
      req.ip,
      'STUDENT_PASSWORD_RESET',
      { student_id: id }
    );
    res.json({ message: `Password reset for ${id}`, tempPassword });
  } catch (err) {
    console.error('resetStudentPassword error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// =============== BULK IMPORT STUDENTS FROM CSV ===============
/*
 * Purpose: Import multiple students from an uploaded CSV file.
 *   The admin selects the class BEFORE uploading; the CSV only needs:
 *   name, email, date_of_birth  (columns in any order, header row required)
 * Parameters:
 *   req.file   - multer memory-stored CSV file (field name: "file")
 *   req.body.class_id - the class all imported students belong to
 * Returns: JSON { imported, skipped, errors[] }
 */
exports.bulkImportStudents = async (req, res) => {
  try {
    const { class_id } = req.body;
    if (!class_id) return res.status(400).json({ error: 'class_id is required' });
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

    // Validate class exists
    const [classRows] = await pool.query('SELECT 1 FROM Class WHERE class_id = ? LIMIT 1', [class_id]);
    if (!classRows.length) return res.status(400).json({ error: 'Invalid class_id' });

    // ── RFC-4180-compliant line parser — handles quoted fields and extra columns ──
    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
      result.push(current.trim());
      return result;
    };

    // Parse CSV from buffer
    const text = req.file.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ error: 'CSV has no data rows' });

    // Parse header
    const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
    const nameIdx = header.indexOf('name');
    const emailIdx = header.indexOf('email');
    const dobIdx = header.indexOf('date_of_birth');
    if (nameIdx === -1 || emailIdx === -1 || dobIdx === -1) {
      return res.status(400).json({ error: 'CSV must have columns: name, email, date_of_birth' });
    }

    const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
    const results = [];
    let imported = 0;

    // Preload existing values for duplicate checks
    const [existingNameRows] = await pool.query(
      'SELECT name FROM Student WHERE class_id = ?',
      [class_id]
    );
    const existingNameSet = new Set(
      existingNameRows
        .map((r) => normalizeValue(r.name))
        .filter(Boolean)
    );

    const [existingEmailRows] = await pool.query(
      "SELECT email FROM Student WHERE email IS NOT NULL AND TRIM(email) <> ''"
    );
    const existingEmailSet = new Set(
      existingEmailRows
        .map((r) => normalizeValue(r.email))
        .filter(Boolean)
    );

    // Track newly inserted rows in this same CSV request
    const pendingNameSet = new Set();
    const pendingEmailSet = new Set();

    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      const name = cols[nameIdx] || '';
      const email = cols[emailIdx] || '';
      const date_of_birth = cols[dobIdx] || '';
      const normalizedName = normalizeValue(name);
      const normalizedEmail = normalizeValue(email);

      // Basic validation per row
      if (!name || !email || !date_of_birth) {
        results.push({ row: i + 1, email, status: 'skipped', reason: 'Missing fields' });
        continue;
      }
      if (!gmailRegex.test(email)) {
        results.push({ row: i + 1, email, status: 'skipped', reason: 'Not a Gmail address' });
        continue;
      }
      if (existingNameSet.has(normalizedName) || pendingNameSet.has(normalizedName)) {
        results.push({ row: i + 1, email, status: 'skipped', reason: 'Duplicate name in selected class' });
        continue;
      }
      if (existingEmailSet.has(normalizedEmail) || pendingEmailSet.has(normalizedEmail)) {
        results.push({ row: i + 1, email, status: 'skipped', reason: 'Duplicate email' });
        continue;
      }
      const dateParts = date_of_birth.split('-');
      if (dateParts.length !== 3 || dateParts[0].length !== 4) {
        results.push({ row: i + 1, email, status: 'skipped', reason: 'Invalid date format (YYYY-MM-DD)' });
        continue;
      }
      const [yyyy, mm, dd] = dateParts;
      const defaultPassword = `${dd}${mm}${yyyy}`.toLowerCase();
      const hash = await bcrypt.hash(defaultPassword, 10);

      // Insert inside transaction with auto-id logic
      const conn = await pool.getConnection();
      let student_id;
      try {
        await conn.beginTransaction();
        const [existingRows] = await conn.query(
          'SELECT student_id FROM Student WHERE class_id = ? FOR UPDATE',
          [class_id]
        );
        const used = new Set();
        for (const r of existingRows) {
          const m = /CL\d+S(\d+)$/.exec(String(r.student_id || ''));
          if (m) used.add(parseInt(m[1], 10));
        }
        const classPart = String(class_id).padStart(2, '0');
        let candidate = 1;
        let inserted = false;
        for (let attempt = 0; attempt < 2000 && !inserted; attempt++) {
          while (used.has(candidate)) candidate++;
          const suffix = String(candidate).padStart(4, '0');
          student_id = `CL${classPart}S${suffix}`;
          try {
            await conn.query(
              'INSERT INTO Student (student_id, name, email, date_of_birth, class_id, password_hash, must_change_password) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [student_id, name, email, date_of_birth, class_id, hash, true]
            );
            inserted = true;
          } catch (e) {
            if (e && e.code === 'ER_DUP_ENTRY') {
              used.add(candidate);
              candidate++;
            } else {
              throw e;
            }
          }
        }
        if (!inserted) throw new Error('Could not generate unique ID');
        await logAction(req.user.id, req.user.role, req.ip, 'STUDENT_BULK_IMPORTED', { student_id });
        await conn.commit();
        conn.release();
        imported++;
        pendingNameSet.add(normalizedName);
        pendingEmailSet.add(normalizedEmail);
        results.push({ row: i + 1, email, status: 'imported', student_id, defaultPassword });

        // Best-effort welcome email
        try {
          const host = process.env.SMTP_HOST;
          const port = parseInt(process.env.SMTP_PORT || '587');
          const user = process.env.SMTP_USER;
          const pass = process.env.SMTP_PASS;
          if (host && user && pass) {
            const transporter = nodemailer.createTransport({ host, port, secure: false, auth: { user, pass } });
            await transporter.sendMail({
              from: process.env.OTP_EMAIL_FROM,
              to: email,
              subject: 'Welcome to the College CR Election System - Your Account Details',
              html: buildStudentWelcomeEmailHtml({
                name,
                email,
                class_id,
                date_of_birth,
                student_id,
                defaultPassword,
              }),
            });
          }
        } catch (_) { /* email is best-effort */ }

      } catch (txErr) {
        try { await conn.rollback(); } catch (_) { }
        conn.release();
        const reason = txErr.code === 'ER_DUP_ENTRY' ? 'Duplicate email' : (txErr.message || 'DB error');
        results.push({ row: i + 1, email, status: 'skipped', reason });
      }
    }

    const skipped = results.filter((r) => r.status === 'skipped').length;
    res.json({ imported, skipped, results });
  } catch (err) {
    console.error('bulkImportStudents error:', err);
    res.status(500).json({ error: 'Server error' });
  }
};
