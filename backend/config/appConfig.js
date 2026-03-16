// config/appConfig.js
require('dotenv').config();

/*
 * Application Configuration
 * 
 * This module provides configuration values for the application, including environment variables,
 * server port, and allowed origins for CORS validation. It reads values from the environment
 * and provides defaults for development.
 * 
 * Exports:
 * - NODE_ENV: The current environment (e.g., 'development', 'production').
 * - PORT: The port number the server listens on.
 * - FRONTEND_ORIGIN: The origin URL for the frontend application.
 * - allowlist: A Set of allowed origins for CORS validation.
 */

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5500;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

const defaultOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://10.160.28.180:5173',
];
const configuredOrigin = FRONTEND_ORIGIN ? [FRONTEND_ORIGIN] : [];
const allowlist = new Set([...configuredOrigin, ...defaultOrigins]);

module.exports = {
  NODE_ENV,
  PORT,
  FRONTEND_ORIGIN,
  allowlist,
};
