import React, { useEffect, useRef, useState } from 'react';
import Navbar from '../../components/Navbar';
import {
  listStudents,
  createStudent,
  updateStudent,
  deleteStudent,
  resetStudentPassword,
  listClasses,
  bulkImportStudents,
} from '../../api/adminApi';
import Select from '../../components/ui/Select';

const GMAIL_RE = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;

/** Parse a single CSV line, honouring double-quoted fields (RFC 4180). */
function parseCSVLine(line) {
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
}

/**
 * Parse CSV text client-side.
 * Picks only name / email / date_of_birth columns; ignores any extras.
 */
function parseCSVPreview(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: 'CSV has no data rows.' };

  const rawHeader = parseCSVLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z_]/g, '')
  );
  const nameIdx  = rawHeader.indexOf('name');
  const emailIdx = rawHeader.indexOf('email');
  const dobIdx   = rawHeader.indexOf('date_of_birth');

  if (nameIdx === -1 || emailIdx === -1 || dobIdx === -1) {
    return {
      rows: [],
      error: `Missing required columns. Found: [${rawHeader.join(', ')}]. Required: name, email, date_of_birth`,
    };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols  = parseCSVLine(lines[i]);
    const name  = cols[nameIdx]  || '';
    const email = cols[emailIdx] || '';
    const dob   = cols[dobIdx]   || '';
    let issue = null;
    if (!name || !email || !dob)             issue = 'Missing fields';
    else if (!GMAIL_RE.test(email))          issue = 'Not a Gmail address';
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) issue = 'Date must be YYYY-MM-DD';
    rows.push({ row: i + 1, name, email, dob, issue });
  }
  return { rows, error: null };
}

function normalizeValue(v) {
  return String(v || '').trim().toLowerCase();
}

export default function AdminStudents() {
  const [students, setStudents] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', date_of_birth: '', class_id: '' });
  const [err, setErr] = useState('');
  const [classes, setClasses] = useState([]);
  const [msg, setMsg] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Bulk CSV import state
  const [bulkClassId, setBulkClassId] = useState('');
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkPreview, setBulkPreview] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkErr, setBulkErr] = useState('');
  const fileInputRef = useRef(null);

  const load = async () => {
    try {
      setErr('');
      const data = await listStudents();
      setStudents(data);
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to load');
    }
  };
  useEffect(() => {
    load();
    const fetchClasses = async () => {
      try {
        const c = await listClasses();
        setClasses(c || []);
      } catch {}
    };
    fetchClasses();
    const onVisibility = () => {
      if (!document.hidden) fetchClasses();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    
    // Prevent multiple submissions
    if (isCreating) return;
    
    setIsCreating(true);
    setErr('');
    setMsg('');
    try {
      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
      if (!gmailRegex.test(String(form.email))) {
        setErr('Only Gmail addresses are supported (example@gmail.com)');
        setIsCreating(false);
        return;
      }

      const formNameKey = normalizeValue(form.name);
      const formEmailKey = normalizeValue(form.email);
      const hasDuplicateName = students.some(
        (s) =>
          String(s.class_id) === String(form.class_id) &&
          normalizeValue(s.name) === formNameKey
      );
      if (hasDuplicateName) {
        setErr('Duplicate name: a student with this name already exists in the selected class');
        setIsCreating(false);
        return;
      }

      const hasDuplicateEmail = students.some(
        (s) => normalizeValue(s.email) === formEmailKey
      );
      if (hasDuplicateEmail) {
        setErr('Duplicate email: this email is already used by another student');
        setIsCreating(false);
        return;
      }

      // Build payload; backend will auto-generate student_id as classIdXXXX
      const payload = {
        name: form.name,
        email: form.email,
        date_of_birth: form.date_of_birth,
        class_id: form.class_id,
      };
      const res = await createStudent(payload);
      setMsg(`Student created. ID: ${res?.student_id} | Default password: ${res?.defaultPassword}`);
      setForm({ name: '', email: '', date_of_birth: '', class_id: '' });
      await load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Failed to create');
    } finally {
      setIsCreating(false);
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!bulkClassId) { setBulkErr('Please select a class first.'); return; }
    if (!bulkFile)    { setBulkErr('Please select a CSV file.'); return; }
    setBulkLoading(true);
    setBulkErr('');
    setBulkResult(null);
    try {
      const result = await bulkImportStudents(bulkClassId, bulkFile);
      setBulkResult(result);
      clearFile();
      await load();
    } catch (e) {
      setBulkErr(e.response?.data?.error || 'Bulk import failed');
    } finally {
      setBulkLoading(false);
    }
  };

  /* ── helpers ── */
  const applyFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setBulkErr('Only .csv files are supported.');
      return;
    }
    setBulkFile(file);
    setBulkResult(null);
    setBulkErr('');
    const reader = new FileReader();
    reader.onload = (ev) => setBulkPreview(parseCSVPreview(ev.target.result));
    reader.readAsText(file);
  };

  const handleFileChange = (e) => applyFile(e.target.files[0] || null);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    applyFile(e.dataTransfer.files[0]);
  };

  const clearFile = () => {
    setBulkFile(null);
    setBulkPreview(null);
    setBulkErr('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const existingNameSetInSelectedClass = new Set(
    students
      .filter((s) => String(s.class_id) === String(bulkClassId))
      .map((s) => normalizeValue(s.name))
      .filter(Boolean)
  );
  const existingEmailSet = new Set(
    students.map((s) => normalizeValue(s.email)).filter(Boolean)
  );

  const previewRowsRaw = bulkPreview?.rows || [];
  const fileNameCount = new Map();
  const fileEmailCount = new Map();
  for (const r of previewRowsRaw) {
    const nameKey = normalizeValue(r.name);
    const emailKey = normalizeValue(r.email);
    if (nameKey) fileNameCount.set(nameKey, (fileNameCount.get(nameKey) || 0) + 1);
    if (emailKey) fileEmailCount.set(emailKey, (fileEmailCount.get(emailKey) || 0) + 1);
  }

  const previewRows = previewRowsRaw.map((r) => {
    let issue = r.issue;
    const nameKey = normalizeValue(r.name);
    const emailKey = normalizeValue(r.email);

    if (!issue && nameKey && fileNameCount.get(nameKey) > 1) {
      issue = 'Duplicate name in CSV';
    }
    if (!issue && emailKey && fileEmailCount.get(emailKey) > 1) {
      issue = 'Duplicate email in CSV';
    }
    if (!issue && nameKey && existingNameSetInSelectedClass.has(nameKey)) {
      issue = 'Name already exists in selected class';
    }
    if (!issue && emailKey && existingEmailSet.has(emailKey)) {
      issue = 'Email already exists';
    }

    return { ...r, issue };
  });

  const validRows = previewRows.filter((r) => !r.issue);
  const invalidRows = previewRows.filter((r) => r.issue);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-4">Students</h1>
        {err && <div className="text-red-600 mb-2">{err}</div>}
        {msg && (
          <div className="text-blue-800 bg-blue-50 border border-blue-200 rounded px-3 py-2 mb-3 text-sm">
            {msg}
          </div>
        )}

        {/* ── Single student form ── */}
        <form
          onSubmit={submit}
          className="bg-white p-4 rounded shadow grid md:grid-cols-2 gap-3 mb-6"
        >
          <label className="text-sm">
            Name <span className="text-red-600">*</span>
            <input
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border p-2 w-full mt-1 rounded"
              required
            />
          </label>
          <label className="text-sm">
            Email <span className="text-red-600">*</span>
            <input
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="border p-2 w-full mt-1 rounded"
              required
            />
          </label>
          <label className="text-sm">
            DOB <span className="text-red-600">*</span>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              className="border p-2 w-full mt-1 rounded"
              required
            />
          </label>
          <Select
            label="Class"
            required
            value={form.class_id}
            onChange={(e) => setForm({ ...form, class_id: e.target.value })}
          >
            <option value="">-- Select Class --</option>
            {classes.map((c) => (
              <option key={c.class_id} value={c.class_id}>
                {c.class_id} - {c.class_name || 'Class'}
              </option>
            ))}
          </Select>
          <div className="text-xs text-gray-500 md:col-span-2">
            Default password: <strong>ddmmyyyy</strong>. Student ID auto-generated as{' '}
            <strong>CL[ClassId]S[0001]</strong>.
          </div>
          <button
            disabled={!form.name || !form.email || !form.date_of_birth || !form.class_id || isCreating}
            className="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? 'Creating...' : 'Create Student'}
          </button>
        </form>

        {/* Bulk CSV import: keep same card and control style as manual form */}
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="text-lg font-semibold mb-3">Bulk Import Students</h2>
          <p className="text-xs text-gray-500 mb-3">
            Select class and upload CSV. Required columns: <strong>name, email, date_of_birth</strong>.
            Extra columns are ignored. On successful import, welcome credentials email is sent to each student
            when SMTP is configured.
          </p>

          <div className="grid md:grid-cols-1 gap-3 mb-3">
            <Select
              label="Class"
              required
              value={bulkClassId}
              onChange={(e) => setBulkClassId(e.target.value)}
            >
              <option value="">-- Select Class --</option>
              {classes.map((c) => (
                <option key={c.class_id} value={c.class_id}>
                  {c.class_id} - {c.class_name || 'Class'}
                </option>
              ))}
            </Select>
          </div>

          <div className="mb-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
              className="hidden"
            />
            {!bulkFile ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded p-6 text-center cursor-pointer transition ${
                  isDragging ? 'border-blue-700 bg-blue-50' : 'border-blue-200 hover:border-blue-500 hover:bg-blue-50'
                }`}
              >
                <p className="text-sm font-medium text-blue-700">Drag and drop CSV here</p>
                <p className="text-xs text-gray-500 mt-1">or click to choose a file</p>
              </div>
            ) : (
              <div className="border border-blue-200 bg-blue-50 rounded px-3 py-2 text-sm flex items-center gap-2">
                <span className="text-blue-800 flex-1">Selected: {bulkFile.name}</span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="text-red-600 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          {/* Parse error */}
          {bulkPreview?.error && (
            <div className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4 text-sm">
              {bulkPreview.error}
            </div>
          )}

          {/* Step 3 – Preview table */}
          {bulkPreview && !bulkPreview.error && previewRows.length > 0 && (
            <div className="mb-5">
              <div className="flex items-center gap-3 mb-2">
                <p className="text-sm font-semibold text-blue-800">Preview</p>
                <span className="text-xs bg-blue-100 text-blue-800 rounded-full px-2 py-0.5 font-medium">
                  {validRows.length} ready
                </span>
                {invalidRows.length > 0 && (
                  <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5 font-medium">
                    {invalidRows.length} will be skipped
                  </span>
                )}
              </div>
              <div className="overflow-auto rounded-lg border border-gray-200 max-h-72 shadow-inner">
                <table className="min-w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-blue-700 text-white text-left">
                      <th className="px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Name</th>
                      <th className="px-3 py-2 font-semibold">Email</th>
                      <th className="px-3 py-2 font-semibold">Date of Birth</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr
                        key={r.row}
                        className={r.issue ? 'bg-red-50' : 'odd:bg-white even:bg-blue-50'}
                      >
                        <td className="px-3 py-1.5 text-gray-400">{r.row}</td>
                        <td className="px-3 py-1.5">{r.name || <span className="text-gray-300 italic">—</span>}</td>
                        <td className="px-3 py-1.5">{r.email || <span className="text-gray-300 italic">—</span>}</td>
                        <td className="px-3 py-1.5">{r.dob || <span className="text-gray-300 italic">—</span>}</td>
                        <td className="px-3 py-1.5">
                          {r.issue ? (
                            <span className="text-red-600 font-medium">&#9888; {r.issue}</span>
                          ) : (
                            <span className="text-blue-700 font-medium">&#10003; Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Import result */}
          {bulkResult && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm">
              <p className="font-semibold text-blue-800 mb-1">
                Import complete: {bulkResult.imported} student{bulkResult.imported !== 1 ? 's' : ''} imported
                {bulkResult.skipped > 0 && `, ${bulkResult.skipped} skipped`}
              </p>
              <p className="text-xs text-blue-700 mb-1">
                Email notices are sent automatically for imported rows when SMTP is enabled.
              </p>
              {bulkResult.skipped > 0 && (
                <details>
                  <summary className="cursor-pointer text-blue-600 text-xs hover:underline">
                    Show skipped rows
                  </summary>
                  <ul className="mt-1 list-disc list-inside text-xs text-gray-600 space-y-0.5">
                    {bulkResult.results.filter((r) => r.status === 'skipped').map((r) => (
                      <li key={r.row}>Row {r.row} — {r.email || '(empty)'}: {r.reason}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {bulkErr && (
            <div className="text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3 text-sm">
              {bulkErr}
            </div>
          )}

          {/* Import button */}
          <button
            onClick={handleBulkUpload}
            disabled={bulkLoading || !bulkClassId || !bulkFile || !!bulkPreview?.error || validRows.length === 0}
            className="bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkLoading
              ? 'Importing and sending emails...'
              : (validRows.length > 0
                ? `Import ${validRows.length} Student${validRows.length !== 1 ? 's' : ''}`
                : 'Import Students')}
          </button>
        </div>

        {/* ── Students table ── */}
        <div className="bg-white rounded shadow overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="p-2">ID</th>
                <th className="p-2">Name</th>
                <th className="p-2">Email</th>
                <th className="p-2">Class</th>
                <th className="p-2">Must Change</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.student_id} className="border-b">
                  <td className="p-2">{s.student_id}</td>
                  <td className="p-2">{s.name}</td>
                  <td className="p-2">{s.email}</td>
                  <td className="p-2">{s.class_id}</td>
                  <td className="p-2">{s.must_change_password ? 'Yes' : 'No'}</td>
                  <td className="p-2 flex gap-2">
                    <button
                      onClick={async () => {
                        await deleteStudent(s.student_id);
                        load();
                      }}
                      className="text-red-600"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
