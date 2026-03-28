/*
 * API: nominationApi
 *
 * Provides functions to interact with nomination-related backend endpoints, including submitting nominations
 * and retrieving nominations for elections. Uses axios for HTTP requests.
 *
 * Exports:
 *   - submitNomination, listByElection, listApprovedByElection, getMyNomination
 *
 * Usage:
 *   import { submitNomination } from './nominationApi';
 */

import axios from './axiosInstance';

// backend expects JSON { election_id, manifesto, photo_url }
export const submitNomination = (payload) => {
  if (payload instanceof FormData) {
    return axios
      .post('/nominations', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  }

  return axios.post('/nominations', payload).then((r) => r.data);
};
export const listByElection = (electionId) =>
  axios.get(`/nominations/election/${electionId}`).then((r) => r.data);
export const listApprovedByElection = (electionId) =>
  axios.get(`/nominations/election/${electionId}/approved`).then((r) => r.data);
export const getMyNomination = (electionId) =>
  axios.get(`/nominations/election/${electionId}/mine`).then((r) => r.data);
