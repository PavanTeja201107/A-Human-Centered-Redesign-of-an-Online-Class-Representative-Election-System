/*
 * API: electionApi
 *
 * Provides functions to interact with election-related backend endpoints, including creation,
 * retrieval, and notification of elections. Uses axios for HTTP requests.
 *
 * Exports:
 *   - createElection, getElections, notifyVotingOpen, notifyNominationOpen, getMyActiveElection, getMyElections
 *
 * Usage:
 *   import { createElection, getElections } from './electionApi';
 */

import axios from './axiosInstance';

// create election
export const createElection = (data) => axios.post('/elections', data).then((r) => r.data);

// get all elections
export const getElections = () => axios.get('/elections').then((r) => r.data);

// notify voting open (announcement)
export const notifyVotingOpen = (id) => axios.post(`/elections/${id}/notify`).then((r) => r.data);
export const notifyNominationOpen = (id) =>
  axios.post(`/elections/${id}/notify/nomination-open`).then((r) => r.data);

// get my active election (student convenience)
export const getMyActiveElection = () => axios.get('/elections/my/active').then((r) => r.data);
export const getMyElections = () => axios.get('/elections/my').then((r) => r.data);
export const getMyWinnerCertificate = () =>
  axios.get('/elections/my/winner-certificate').then((r) => r.data);
