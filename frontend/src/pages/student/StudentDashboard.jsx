/*
 * Page: StudentDashboard
 *
 * Provides an overview dashboard for students, displaying active elections, notifications,
 * and quick links to election actions.
 *
 * Features:
 *   - Shows current/active election details
 *   - Displays notifications and last login banner
 *   - Provides quick navigation links
 *
 * Usage:
 *   Rendered as the main landing page for student users after login.
 */

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import { getMyActiveElection, getMyWinnerCertificate } from '../../api/electionApi';
import { getMyNotifications } from '../../api/notificationsApi';
import Alert from '../../components/ui/Alert';
import LastLoginBanner from '../../components/ui/LastLoginBanner';

export default function StudentDashboard() {
  const [election, setElection] = useState(null);
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [canDownloadWinnerCertificate, setCanDownloadWinnerCertificate] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await getMyActiveElection();
        setElection(data || null);
      } catch (err) {
        setElection(null);
      }
      try {
        const n = await getMyNotifications();
        setNotices(n || []);
      } catch {}

      try {
        await getMyWinnerCertificate();
        setCanDownloadWinnerCertificate(true);
      } catch {
        setCanDownloadWinnerCertificate(false);
      }

      setLoading(false);
    };
    fetch();
  }, []);

  // Simulate notification toggle (replace with API call if needed)
  const handleToggleNotifications = () => {
    setNotificationsEnabled((v) => !v);
  };

  const quickLinks = [
    { to: '/student/election', label: 'Election Details' },
    { to: '/student/nomination', label: 'Nominate' },
    { to: '/student/vote', label: 'Vote Now' },
    { to: '/student/results', label: 'Results' },
    { to: '/student/profile', label: 'My Profile' },
  ];
  const winnerCertificateLink = {
    to: '/student/winner-certificate',
    label: 'Download Winner Certificate',
  };
  const showWinnerNotice = notificationsEnabled && canDownloadWinnerCertificate;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      <Navbar />
      <div className="container mx-auto px-6 py-10">
        <LastLoginBanner />
        <header className="mb-8">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900">
            Student Dashboard
          </h1>
          <p className="mt-1 text-gray-600">
            Keep track of your elections, nominations, and notifications.
          </p>
        </header>

        {loading ? (
          <div className="py-10 text-center text-gray-500">Loading…</div>
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <section className="lg:col-span-2 space-y-8">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-xl font-bold text-gray-900">Active Election</h2>
                {election ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="text-sm text-gray-500">Election ID</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {election.election_id}
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <div className="text-sm text-gray-500">Voting Window</div>
                      <div className="text-lg font-semibold text-gray-900">
                        {new Date(election.voting_start).toLocaleString()} –{' '}
                        {new Date(election.voting_end).toLocaleString()}
                      </div>
                    </div>
                    <div className="sm:col-span-2 mt-4 grid grid-cols-2 gap-3 sm:flex sm:flex-row">
                      {quickLinks.slice(0, 4).map((l) => (
                        <Link
                          key={l.to}
                          to={l.to}
                          className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/60 hover:text-indigo-700"
                        >
                          {l.label}
                        </Link>
                      ))}
                      {canDownloadWinnerCertificate && (
                        <Link
                          to={winnerCertificateLink.to}
                          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-emerald-700"
                        >
                          {winnerCertificateLink.label}
                        </Link>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-600">No active election.</div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-xl font-bold text-gray-900">Quick Links</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    ...quickLinks,
                    ...(canDownloadWinnerCertificate ? [winnerCertificateLink] : []),
                  ].map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-indigo-50/60"
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 12l2 2 4-4 1.5 1.5L11 17 7.5 13.5 9 12z" />
                        </svg>
                      </span>
                      <span className="text-sm font-semibold text-gray-800 group-hover:text-indigo-700">
                        {l.label}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            </section>

            <aside className="lg:col-span-1">
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="mb-3 text-xl font-bold text-gray-900">Notifications</h2>
                <div className="mb-3 flex items-center justify-between">
                  <span>Notifications</span>
                  <button
                    className={`px-3 py-1 rounded ${notificationsEnabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                    onClick={handleToggleNotifications}
                  >
                    {notificationsEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                {!notificationsEnabled ? (
                  <div className="text-gray-600">Notifications are disabled.</div>
                ) : (!notices || notices.length === 0) && !showWinnerNotice ? (
                  <div className="text-gray-600">No notifications yet.</div>
                ) : (
                  <ul className="space-y-3">
                    {showWinnerNotice && (
                      <li>
                        <Alert kind="winner">
                          <div className="text-sm font-semibold text-rose-950">
                            Congrats! You won the election. Download your certificate from Quick Links on the Student Dashboard.
                          </div>
                        </Alert>
                      </li>
                    )}
                    {notices.slice(0, 3).map((n, idx) => {
                      const kind =
                        n.type === 'RESULTS_PUBLISHED'
                          ? 'success'
                          : n.type === 'VOTING_OPEN'
                            ? 'info'
                            : 'warning';
                      let message = n.message;
                      if (n.type === 'RESULTS_PUBLISHED') {
                        message = `Results published for Election #${n.election_id}`;
                      }
                      return (
                        <li key={idx}>
                          <Alert kind={kind}>
                            <div className="text-sm">
                              <span className="font-medium">Election #{n.election_id}:</span>{' '}
                              {message}
                            </div>
                          </Alert>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
