// lib/storage-policy.js
// The access rules behind api/storage.js, kept free of HTTP and database so
// they can be tested directly. Every decision about "who may see or change
// what" lives here; the endpoint only fetches rows and applies these.
//
// The rules exist because the client cannot enforce them. app.js loads the
// whole user table at boot and writes the whole table back on every change,
// so the server has to treat any incoming map as a proposal and narrow both
// directions itself.

// Reference data - identical for everyone, safe to read signed-out, admin-only
// to change.
const PUBLIC_KEYS = new Set(['cbp:banks', 'cbp:templates']);
// Per-user collections - must be filtered to the caller on the way out and on
// the way in.
const OWNED_KEYS = new Set(['cbp:users', 'cbp:logs', 'cbp:feedback']);

const LEGACY_USERS_KEY = 'cbp:users';

function normalize(v) {
  const digits = String(v || '').replace(/\D/g, '').replace(/^91/, '');
  return digits ? '+91' + digits : '';
}

function isAddressable(key) {
  return PUBLIC_KEYS.has(key) || OWNED_KEYS.has(key);
}

// Their own number, plus any account that named them as a *verified* alternate
// contact. That second case is the "acting on behalf of" flow the dashboard
// already supports and is the only route by which one phone may touch
// another's record. An unverified alternate grants nothing - otherwise typing
// a stranger's number into your own profile would reach their data.
function reachablePhones(caller, records) {
  const me = normalize(caller);
  const phones = new Set();
  if (!me) return phones;
  phones.add(me);
  for (const rec of records || []) {
    if (!rec) continue;
    if (normalize(rec.altPhone) === me && rec.altVerified) {
      const owner = normalize(rec.phone);
      if (owner) phones.add(owner);
    }
  }
  return phones;
}

// Narrows a stored set of records down to the map shape the client expects,
// containing only what this caller is entitled to.
function usersMapFor(caller, records) {
  const allowed = reachablePhones(caller, records);
  const out = {};
  for (const rec of records || []) {
    if (!rec) continue;
    const phone = normalize(rec.phone);
    if (phone && allowed.has(phone)) out[rec.phone] = rec;
  }
  return out;
}

// Treats an incoming users map as a proposal: returns only the entries the
// caller may persist. A stale map from an old session therefore cannot
// overwrite anyone else, and entries for unknown phones are dropped silently
// rather than failing the whole write.
function writableRecords(caller, proposed, records) {
  const allowed = reachablePhones(caller, records);
  const out = [];
  for (const rec of Object.values(proposed || {})) {
    const phone = normalize(rec && rec.phone);
    if (phone && allowed.has(phone)) out.push({ phone, record: rec });
  }
  return out;
}

// Log and feedback entries carry the phone they belong to, so one account
// cannot write history into another's timeline. Entries with no phone are
// kept - they are the caller's own by construction.
function ownEntries(caller, list) {
  const me = normalize(caller);
  if (!Array.isArray(list)) return [];
  return list.filter((e) => !e || !e.phone || normalize(e.phone) === me);
}

// What a signed-out browser gets. The app reads these at boot, before anyone
// has logged in, and still has to render - empty is the honest answer, since
// a signed-out browser owns nothing.
function emptyFor(key) {
  return key === 'cbp:users' ? {} : [];
}

module.exports = {
  PUBLIC_KEYS, OWNED_KEYS, LEGACY_USERS_KEY,
  normalize, isAddressable, reachablePhones, usersMapFor,
  writableRecords, ownEntries, emptyFor,
};
