import axios from 'axios';
import { createWalletAuth } from './auth-session';

const env = import.meta.env;
const origin = window.location.origin;
const auth = createWalletAuth({ baseUrl: env.VITE_CONFIG_API_URL || '', origin });
const allowedBases = [env.VITE_CONFIG_API_URL, env.VITE_CHATBOT_API_URL || origin,
  env.VITE_FINANCIAL_AGENT_URL || 'http://127.0.0.1:3003'].filter(Boolean).map((base) => new URL(base.replace(/\/$/, ''), origin));

function requireApiUrl(value) {
  const url = new URL(value, origin);
  if (!allowedBases.some((base) => url.origin === base.origin
    && (url.pathname === base.pathname || url.pathname.startsWith(`${base.pathname.replace(/\/$/, '')}/`)))) {
    throw new Error('Authentication is restricted to the configured wallet APIs.');
  }
}

export const configureWalletAuth = auth.configure;
export const clearWalletAuth = auth.clear;
export const getAuthHeaders = auth.headers;

export async function authenticatedFetch(url, options = {}) {
  requireApiUrl(url);
  return fetch(url, { ...options, redirect: 'error', headers: { ...options.headers, ...await auth.headers() } });
}

const authenticatedAxios = axios.create();
authenticatedAxios.interceptors.request.use(async (config) => {
  requireApiUrl(config.url);
  Object.assign(config.headers, await auth.headers());
  return config;
});
export default authenticatedAxios;
