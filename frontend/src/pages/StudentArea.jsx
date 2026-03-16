/*
 * Component: StudentArea
 *
 * Provides the main routing structure for all student-related pages, including login, dashboard,
 * elections, nominations, voting, and results. Handles role-based redirects and route protection.
 *
 * Features:
 *   - Defines all student routes and their components
 *   - Redirects non-student users to their appropriate dashboard
 *   - Uses ProtectedRoute and GuestRoute for access control
 *
 * Usage:
 *   Used as the main student area entry point in the app's router.
 */
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import StudentLogin from './student/StudentLogin';
import StudentDashboard from './student/StudentDashboard';
import StudentProfile from './student/StudentProfile';
import VerifyOtp from './auth/VerifyOtp';
import ProtectedRoute from '../components/ProtectedRoute';
import GuestRoute from '../components/GuestRoute';
import useAuth from '../hooks/useAuth';
import { useEffect } from 'react';
import ChangePassword from './auth/ChangePassword';
import ResetPassword from './auth/ResetPassword';
import ElectionPage from './student/StudentElections';
import NominationForm from './student/NominationForm';
import VotePage from './student/Vote';
import ResultsPage from './student/ElectionResults';
import WinnerCertificate from './student/WinnerCertificate';

export default function StudentArea() {
  const { user, logout } = useAuth();

  useEffect(() => {
    // If current user is authenticated but not a STUDENT, redirect them to their own dashboard
    if (user?.token && user?.role && user.role !== 'STUDENT') {
      if (user.role === 'ADMIN') window.location.href = '/admin/dashboard';
      else window.location.href = '/';
    }
  }, [user]);

  return (
    <Routes>
      <Route
        path="login"
        element={
          <GuestRoute>
            <StudentLogin />
          </GuestRoute>
        }
      />
      {/** Do NOT use GuestRoute here: after OTP verification we log the user in, and GuestRoute would redirect to dashboard before we can route to change-password */}
      <Route path="verify-otp" element={<VerifyOtp />} />
      <Route
        path="change-password"
        element={
          <ProtectedRoute role="STUDENT">
            <ChangePassword />
          </ProtectedRoute>
        }
      />
      <Route
        path="reset-password"
        element={
          <GuestRoute>
            <ResetPassword />
          </GuestRoute>
        }
      />
      <Route
        path="dashboard"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="election"
        element={
          <ProtectedRoute role="STUDENT">
            <ElectionPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="nomination"
        element={
          <ProtectedRoute role="STUDENT">
            <NominationForm />
          </ProtectedRoute>
        }
      />
      <Route
        path="vote"
        element={
          <ProtectedRoute role="STUDENT">
            <VotePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="results"
        element={
          <ProtectedRoute role="STUDENT">
            <ResultsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="winner-certificate"
        element={
          <ProtectedRoute role="STUDENT">
            <WinnerCertificate />
          </ProtectedRoute>
        }
      />
      <Route
        path="profile"
        element={
          <ProtectedRoute role="STUDENT">
            <StudentProfile />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
