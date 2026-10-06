const STORAGE_VERSION_KEY = 'aa_wallet_storage_version';
export const STORAGE_VERSION = 1;

export const StorageKey = Object.freeze({
  CURRENT_VIEW: 'currentView',
  PENDING_USER_OPS: 'pendingUserOps',
  TRACKED_OPS: 'trackedOps',
  SHARED_DATA: 'aa_wallet_shared_data_cache',
  AGENT_READY: 'aa_wallet_agent_ready_accounts',
  CONFIG: 'aa_wallet_config',
  CHAT_MESSAGES: 'aa_wallet_chat_messages',
  FINANCE_MESSAGES: 'aa_wallet_finance_messages',
  USER_DISCONNECTED: 'userDisconnected',
  SESSION_BURNER_KEY: 'session_burner_key',
  SESSION_BURNER_KEYS_MAP: 'session_burner_keys_map',
  WEBAUTHN_CREDENTIAL: 'webauthn_credential',
});

function storageAvailable() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function ensureStorageVersion() {
  if (!storageAvailable()) return;
  const current = Number(window.localStorage.getItem(STORAGE_VERSION_KEY) || 0);
  if (current < STORAGE_VERSION) {
    // Version 1 intentionally preserves every legacy key and value in place.
    window.localStorage.setItem(STORAGE_VERSION_KEY, String(STORAGE_VERSION));
  }
}

export function readStoredJson(key, fallback, validate = () => true) {
  try {
    ensureStorageVersion();
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key, value) {
  try {
    ensureStorageVersion();
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Persistence is best-effort. React state remains authoritative in this tab.
  }
}

export function readStoredString(key, fallback = '') {
  try {
    ensureStorageVersion();
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredString(key, value) {
  try {
    ensureStorageVersion();
    window.localStorage.setItem(key, String(value));
  } catch {
    // Best-effort only.
  }
}

export function removeStoredValue(key) {
  try {
    ensureStorageVersion();
    window.localStorage.removeItem(key);
  } catch {
    // Best-effort only.
  }
}

export function subscribeToStorage(keys, listener) {
  if (typeof window === 'undefined') return () => {};
  const allowed = new Set(keys);
  const handler = (event) => {
    if (event.storageArea === window.localStorage && event.key && allowed.has(event.key)) listener(event);
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
