import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import Button from '../../components/ui/Button';
import Alert from '../../components/ui/Alert';
import { getMyWinnerCertificate } from '../../api/electionApi';

function formatCertificateDate(dateValue) {
  if (!dateValue) return '';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function sanitizeForFileName(input) {
  return String(input || 'class')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9-_]/g, '');
}

function escapeHtml(input) {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function WinnerCertificate() {
  const [certificate, setCertificate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCertificate = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await getMyWinnerCertificate();
        setCertificate(data);
      } catch (err) {
        const apiMessage = err?.response?.data?.error;
        if (err?.response?.status === 403) {
          setError('You are not authorized to view this certificate.');
        } else {
          setError(apiMessage || 'Certificate is not available right now.');
        }
        setCertificate(null);
      } finally {
        setLoading(false);
      }
    };

    loadCertificate();
  }, []);

  const certificateDate = useMemo(
    () => formatCertificateDate(certificate?.election_date),
    [certificate],
  );

  const organizationName =
    certificate?.organization_name && String(certificate.organization_name).trim().length > 0
      ? certificate.organization_name
      : 'Academic Election Management System';

  const downloadFileName = useMemo(() => {
    const studentName = sanitizeForFileName(certificate?.student_name || 'student');
    const className = sanitizeForFileName(certificate?.class_name || 'class');
    const parsedDate = new Date(certificate?.election_date || Date.now());
    const year = Number.isNaN(parsedDate.getTime())
      ? new Date().getFullYear()
      : parsedDate.getFullYear();
    return `${studentName}_certificate_${className}_${year}.html`;
  }, [certificate]);

  const buildCertificateHtml = () => {
    if (!certificate) return '';

    const safeTitle = escapeHtml(certificate.title || 'CLASS REPRESENTATIVE ELECTION');
    const safeSubtitle = escapeHtml(
      certificate.subtitle || 'WINNER DECLARATION CERTIFICATE',
    );
    const safeOrgName = escapeHtml(organizationName);
    const safeStudentName = escapeHtml(certificate.student_name || '');
    const safeStudentId = escapeHtml(certificate.student_id || '');
    const safeClassName = escapeHtml(certificate.class_name || '');
    const safeDate = escapeHtml(certificateDate || '');

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Winner Declaration Certificate</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 24px;
        background: #f3efe5;
        font-family: Georgia, 'Times New Roman', serif;
        color: #2f2a25;
      }
      .certificate-shell {
        max-width: 960px;
        margin: 0 auto;
        background: #fffdf7;
        border: 4px solid #7a5a2f;
        outline: 2px solid #d7c5a4;
        outline-offset: -14px;
        padding: 48px 42px;
        text-align: center;
      }
      .heading-top {
        font-size: 28px;
        letter-spacing: 1px;
        margin: 0;
      }
      .heading-main {
        margin: 12px 0 6px;
        font-size: 38px;
        letter-spacing: 1.2px;
      }
      .org {
        margin-top: 8px;
        font-size: 18px;
        color: #5f4b2f;
      }
      .block {
        margin-top: 30px;
        font-size: 21px;
        line-height: 1.8;
      }
      .name {
        margin: 18px 0 8px;
        font-size: 44px;
        letter-spacing: 2px;
        text-transform: uppercase;
      }
      .meta {
        margin: 0;
        font-size: 20px;
      }
      .role {
        display: inline-block;
        margin-top: 16px;
        padding: 6px 18px;
        border: 2px solid #7a5a2f;
        letter-spacing: 1px;
        font-weight: 700;
      }
      .value {
        font-weight: 700;
      }
      .closing {
        margin-top: 34px;
        font-size: 20px;
        line-height: 1.8;
      }
      @media print {
        body {
          padding: 0;
          background: #fff;
        }
        .certificate-shell {
          max-width: none;
          margin: 0;
          min-height: 100vh;
        }
      }
    </style>
  </head>
  <body>
    <div class="certificate-shell">
      <h1 class="heading-top">${safeTitle}</h1>
      <h2 class="heading-main">${safeSubtitle}</h2>
      <p class="org">${safeOrgName}</p>

      <div class="block">
        <p>This is to certify that</p>
        <p class="name">${safeStudentName}</p>
        <p class="meta">(Student ID: ${safeStudentId})</p>

        <p>has been officially declared as the</p>
        <div class="role">CLASS REPRESENTATIVE</div>

        <p>for the class</p>
        <p class="value">${safeClassName}</p>

        <p>in the election conducted on</p>
        <p class="value">${safeDate}</p>
      </div>

      <p class="closing">
        The student has received the highest number of valid votes and is hereby recognized as the
        elected representative for the class.
        <br /><br />
        We congratulate the student for their achievement and wish them success in representing
        their classmates.
      </p>
    </div>
  </body>
</html>`;

    return html;
  };

  const handleDownload = () => {
    if (!certificate) return;
    const html = buildCertificateHtml();
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadAsImage = async () => {
    if (!certificate) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const certElement = document.querySelector('.certificate-card');
      if (!certElement) return;

      const canvas = await html2canvas(certElement, {
        scale: 2,
        backgroundColor: '#fffdf7',
        useCORS: true,
        allowTaint: true,
      });

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      const fileName = downloadFileName.replace('.html', '.png');
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Error downloading as image:', err);
      alert('Failed to download certificate as image. Please try PDF export instead.');
    }
  };

  return (
    <div className="min-h-screen bg-[#f3efe5] text-[#2f2a25]">
      <Navbar />
      <style>{`
        @media print {
          header { display: none !important; }
          .certificate-actions { display: none !important; }
          .certificate-page-shell { padding: 0 !important; margin: 0 !important; }
          body { background: white; }
          .certificate-card {
            border: 4px solid #7a5a2f !important;
            outline: 2px solid #d7c5a4 !important;
            outline-offset: -14px !important;
            box-shadow: none !important;
            margin: 0 !important;
            min-height: 100vh !important;
            border-radius: 0 !important;
            width: 100% !important;
            page-break-after: avoid;
          }
        }
      `}</style>

      <div className="certificate-page-shell mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="certificate-actions mb-5 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-[#3b2f21]">Winner Certificate Preview</h1>
          <div className="flex flex-wrap gap-2">
            <Link to="/student/dashboard" className="inline-flex">
              <Button variant="secondary">Back to Dashboard</Button>
            </Link>
            <Button onClick={handlePrint}>Print Certificate</Button>
            <Button variant="secondary" onClick={handleDownload}>
              Download Certificate
            </Button>
            <Button variant="secondary" onClick={handleDownloadAsImage}>
              Download as Image
            </Button>
          </div>
        </div>

        {loading && (
          <div className="rounded-xl bg-white px-6 py-10 text-center shadow-sm">
            Loading certificate...
          </div>
        )}

        {!loading && error && (
          <Alert kind="danger" className="certificate-actions mb-4">
            {error}
          </Alert>
        )}

        {!loading && certificate && (
          <section className="certificate-card mx-auto w-full max-w-5xl rounded-lg border-4 border-[#7a5a2f] bg-[#fffdf7] px-4 py-10 shadow-lg outline outline-2 -outline-offset-[14px] outline-[#d7c5a4] sm:px-8 md:px-12">
            <header className="text-center">
              <p className="text-xl font-semibold tracking-wide sm:text-2xl">
                {certificate.title || 'CLASS REPRESENTATIVE ELECTION'}
              </p>
              <p className="mt-2 text-3xl font-bold tracking-wide text-[#5e421f] sm:text-4xl">
                {certificate.subtitle || 'WINNER DECLARATION CERTIFICATE'}
              </p>
              <p className="mt-3 text-base italic text-[#6f5b3d] sm:text-lg">{organizationName}</p>
            </header>

            <article className="mx-auto mt-10 max-w-3xl text-center text-lg leading-9 text-[#2f2a25] sm:text-xl">
              <p>This is to certify that</p>

              <p className="mt-5 text-3xl font-bold uppercase tracking-[0.12em] text-[#4f3413] sm:text-5xl">
                {certificate.student_name}
              </p>

              <p className="mt-3 text-base sm:text-xl">(Student ID: {certificate.student_id})</p>

              <p className="mt-6">has been officially declared as the</p>

              <p className="mx-auto mt-4 inline-block border-2 border-[#7a5a2f] px-5 py-1 text-base font-bold tracking-[0.12em] sm:text-lg">
                CLASS REPRESENTATIVE
              </p>

              <p className="mt-6">for the class</p>
              <p className="mt-2 text-3xl font-semibold tracking-[0.1em] sm:text-4xl">
                {certificate.class_name}
              </p>

              <p className="mt-6">in the election conducted on</p>
              <p className="mt-2 text-2xl font-semibold sm:text-3xl">{certificateDate}</p>

              <p className="mt-8 text-base leading-8 text-[#463523] sm:text-lg">
                The student has received the highest number of valid votes and is hereby recognized
                as the elected representative for the class.
              </p>

              <p className="mt-5 text-base leading-8 text-[#463523] sm:text-lg">
                We congratulate the student on this achievement and wish them success in
                representing their classmates.
              </p>
            </article>
          </section>
        )}
      </div>
    </div>
  );
}
