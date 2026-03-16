/**
 * API: adminApi
 *
 * Provides functions to interact with admin-related backend endpoints, including class and student management,
 * and admin profile operations. Uses axios for HTTP requests.
 *
 * Exports:
 * - listClasses, createClass, deleteClass
 * - listStudents, getStudent, createStudent, updateStudent, deleteStudent, resetStudentPassword
 * - getAdminProfile, updateAdminProfile
 *
 * Usage:
 * import { listClasses, createClass } from './adminApi';
 */

import axios from './axiosInstance';

// Classes
export const listClasses = () => axios.get('/admin/classes').then((r) => r.data);
export const createClass = (class_name) =>
  axios.post('/admin/classes', { class_name }).then((r) => r.data);
export const deleteClass = (id, params = {}) =>
  axios.delete(`/admin/classes/${id}`, { params }).then((r) => r.data);

// Students
export const listStudents = () => axios.get('/admin/students').then((r) => r.data);
export const getStudent = (id) => axios.get(`/admin/students/${id}`).then((r) => r.data);
export const createStudent = (payload) =>
  axios.post('/admin/students', payload).then((r) => r.data);
export const updateStudent = (id, payload) =>
  axios.put(`/admin/students/${id}`, payload).then((r) => r.data);
export const deleteStudent = (id) => axios.delete(`/admin/students/${id}`).then((r) => r.data);
export const resetStudentPassword = (id) =>
  axios.post(`/admin/students/${id}/reset-password`).then((r) => r.data);

// Admin profile
export const getAdminProfile = () => axios.get('/admin/profile').then((r) => r.data);
export const updateAdminProfile = (payload) =>
  axios.put('/admin/profile', payload).then((r) => r.data);

// Bulk import students from CSV (class_id chosen by admin, CSV has name/email/date_of_birth)
export const bulkImportStudents = (classId, file) => {
  const form = new FormData();
  form.append('class_id', classId);
  form.append('file', file);
  return axios.post('/admin/students/bulk-import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then((r) => r.data);
};
