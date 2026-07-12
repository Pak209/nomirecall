const crypto = require('crypto');

// Referral system — route handlers/helpers.
//
// A user shares their referral code; a NEW user redeems it and BOTH sides get a
// timed Pro trial (`proTrialUntil`, an ISO string). The trial is intentionally
// decoupled from RevenueCat and the paid-tier fields: `aiUsage.getUserAIUsageTier`
// only lifts a *free* user to `pro` while the trial is active, so paid tiers keep
// precedence and no billing state is ever touched here.
//
// `deps` is injected by server.js so this module stays independent of Firebase /
// persistence details (mirrors how ./circle and ./store are wired):
//   { store }  // needs getUserById, updateUserById, findUserByReferralCode
//
// All timing is server-side. Codes use an unambiguous uppercase alphabet so they
// are easy to read/share; redeem input is normalized to the same shape before any
// store lookup, which keeps findUserByReferralCode a pure exact match.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // A–Z minus I/O, digits 2–9
const CODE_LENGTH = 8;
const TRIAL_DAYS = 7; // days of Pro granted to each side per successful redemption
const MAX_GRANTED_DAYS = 90; // cap on the referrer's *running* bonus total
const REDEEM_WINDOW_DAYS = 7; // redemption allowed only within N days of signup
const DAY_MS = 24 * 60 * 60 * 1000;
const CODE_GENERATION_ATTEMPTS = 8; // retries on a (astronomically rare) collision

function generateReferralCode() {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  }
  return code;
}

// Normalize a user-supplied code to the exact shape codes are stored in, so a
// lowercase/whitespace-padded paste still resolves to the right referrer.
function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function parseDateMs(value) {
  if (!value) return NaN;
  const ms = value instanceof Date ? value.getTime() : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : NaN;
}

// Extend a Pro trial: base = max(now, existing proTrialUntil), then + `days`.
// An already-expired (or absent) trial restarts from now; an active one stacks.
function extendedTrialISO(existing, days = TRIAL_DAYS, now = Date.now()) {
  const existingMs = parseDateMs(existing);
  const base = Number.isFinite(existingMs) && existingMs > now ? existingMs : now;
  return new Date(base + days * DAY_MS).toISOString();
}

function userIdOf(user) {
  return user && (user.id || user.uid || user.firebaseUid);
}

// Lazily generate + persist a unique referral code on first access. Retries on a
// collision by re-checking the store before writing.
async function ensureReferralCode(deps, user) {
  if (user.referralCode) return user;
  for (let attempt = 0; attempt < CODE_GENERATION_ATTEMPTS; attempt += 1) {
    const code = generateReferralCode();
    const clash = await deps.store.findUserByReferralCode(code);
    if (clash) continue;
    const updated = await deps.store.updateUserById(userIdOf(user), { referralCode: code });
    return updated || { ...user, referralCode: code };
  }
  throw new Error('Could not generate a unique referral code.');
}

// GET /api/referral/me
async function getReferralSummary(deps, userId) {
  const user = await deps.store.getUserById(userId);
  if (!user) return { status: 404, body: { error: 'User not found' } };
  const withCode = await ensureReferralCode(deps, user);
  return {
    status: 200,
    body: {
      code: withCode.referralCode,
      proTrialUntil: withCode.proTrialUntil || null,
      grantedDays: Number(withCode.referralGrantedDays || 0),
      redeemed: Boolean(withCode.referralRedeemedAt),
    },
  };
}

// POST /api/referral/redeem { code }
// Validations run in a fixed order with distinct 4xx messages. If the referrer is
// capped, the redeemer STILL gets their trial — the cap only blocks the referrer's
// bonus.
async function redeem(deps, redeemerId, rawCode) {
  const code = normalizeCode(rawCode);
  if (!code) return { status: 400, body: { error: 'A referral code is required.' } };

  const redeemer = await deps.store.getUserById(redeemerId);
  if (!redeemer) return { status: 404, body: { error: 'User not found' } };

  // 1. Code exists.
  const referrer = await deps.store.findUserByReferralCode(code);
  if (!referrer) return { status: 404, body: { error: 'That referral code does not exist.' } };

  // 2. Not self.
  if (userIdOf(referrer) === redeemerId) {
    return { status: 400, body: { error: 'You cannot redeem your own referral code.' } };
  }

  // 3. Redeemer has not already redeemed a code.
  if (redeemer.referralRedeemedAt) {
    return { status: 409, body: { error: 'You have already redeemed a referral code.' } };
  }

  // 4. Redeemer account is within the redemption window (based on its createdAt).
  const now = Date.now();
  const createdMs = parseDateMs(redeemer.createdAt);
  if (!Number.isFinite(createdMs) || now - createdMs > REDEEM_WINDOW_DAYS * DAY_MS) {
    return { status: 403, body: { error: 'referral window has closed' } };
  }

  // 5. Referrer cap — cap only blocks the referrer's bonus, never the redeemer's.
  const referrerGranted = Number(referrer.referralGrantedDays || 0);
  const referrerRewarded = referrerGranted < MAX_GRANTED_DAYS;
  const nowISO = new Date(now).toISOString();

  // Redeemer always gets their trial.
  const redeemerTrial = extendedTrialISO(redeemer.proTrialUntil, TRIAL_DAYS, now);
  await deps.store.updateUserById(redeemerId, {
    proTrialUntil: redeemerTrial,
    referredBy: userIdOf(referrer),
    referralRedeemedAt: nowISO,
  });

  // Referrer gets their bonus only when under the cap.
  if (referrerRewarded) {
    const referrerTrial = extendedTrialISO(referrer.proTrialUntil, TRIAL_DAYS, now);
    await deps.store.updateUserById(userIdOf(referrer), {
      proTrialUntil: referrerTrial,
      referralGrantedDays: referrerGranted + TRIAL_DAYS,
    });
  }

  return {
    status: 200,
    body: { ok: true, proTrialUntil: redeemerTrial, referrerRewarded },
  };
}

module.exports = {
  CODE_ALPHABET,
  CODE_LENGTH,
  TRIAL_DAYS,
  MAX_GRANTED_DAYS,
  REDEEM_WINDOW_DAYS,
  generateReferralCode,
  normalizeCode,
  extendedTrialISO,
  ensureReferralCode,
  getReferralSummary,
  redeem,
};
