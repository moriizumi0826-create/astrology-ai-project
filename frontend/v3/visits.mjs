import { apiUrl } from './api-origin.mjs';

const ID_KEY = 'ca:visitor-id:v1';
const DAY_KEY = 'ca:visit-day:v1';
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function japanVisitDate(now) {
  return new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
}

export async function trackVisit({ production, storage, crypto, send, now = new Date(), doNotTrack = false }) {
  if (!production || doNotTrack) return;
  try {
    const day = japanVisitDate(now);
    if (storage.getItem(DAY_KEY) === day) return;
    let id = storage.getItem(ID_KEY);
    if (!UUID4.test(id || '')) {
      id = crypto.randomUUID();
      storage.setItem(ID_KEY, id);
    }
    // Mark only after success: failed requests may retry on the next page visit.
    if (await send(id)) storage.setItem(DAY_KEY, day);
  } catch {
    // Storage/network failures must never interfere with login or charts.
  }
}

if (typeof window !== 'undefined') {
  try {
  // Run once per page load, including LP/login. Never send identity/auth headers.
  void trackVisit({
    production: typeof __APP_ENVIRONMENT__ !== 'undefined' && __APP_ENVIRONMENT__ === 'production',
    storage: window.localStorage,
    crypto: window.crypto,
    doNotTrack: navigator.doNotTrack === '1',
    send: async id => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(apiUrl('/api/v3/visits'), {
          method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ visitor_id: id }), signal: controller.signal,
        });
        return response.ok && (await response.json()).recorded === true;
      } finally { clearTimeout(timer); }
    },
  });
  } catch { /* Storage can be disabled by the browser. */ }
}
