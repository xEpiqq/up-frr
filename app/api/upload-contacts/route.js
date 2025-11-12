import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Runtime config: use Node, allow longer runs (host-dependent).
// ─────────────────────────────────────────────────────────────────────────────
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // up to 5 minutes where supported

// ─────────────────────────────────────────────────────────────────────────────
// Supabase (server) – SERVICE ROLE for read/write on contact_queue
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://upxztevetixqwlzpnjfv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVweHp0ZXZldGl4cXdsenBuamZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0OTI1MjQsImV4cCI6MjA3NTA2ODUyNH0.I-geY9rd_7vcqhsktT2pUeo9-tnA-087ic3W1Qtw-Sw';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'send-web-api' } }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LeadConnector / GHL config
// ─────────────────────────────────────────────────────────────────────────────
const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_CONTACTS_URL = `${GHL_BASE}/contacts/`;
const GHL_VERSION = '2021-07-28';
const GHL_PIT = 'pit-f45cb018-0c57-4b4b-90f5-1d14217fe873'; // private integration token
const RATE_LIMIT_RPS = 5;
const CALL_CAP = 5; // hard max per HTTP call

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────
function json(obj, status = 200) {
  return NextResponse.json(obj, { status });
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
function toE164US(phone) {
  if (!phone) return undefined;
  const digits = String(phone).replace(/\D+/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (String(phone).startsWith('+')) return String(phone);
  return undefined;
}
function ghlHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Version: GHL_VERSION,
    Authorization: `Bearer ${GHL_PIT}`
  };
}

// Track a global (per-process) backoff until timestamp when 429 is received
let globalBackoffUntil = 0;
function getRemainingBackoffMs() {
  return Math.max(0, globalBackoffUntil - Date.now());
}
function parseRetryAfterMs(headerValue) {
  if (!headerValue) return 0;
  const s = String(headerValue).trim();
  // Numeric seconds
  const asNum = Number(s);
  if (Number.isFinite(asNum) && asNum >= 0) return Math.floor(asNum * 1000);
  // HTTP date
  const asDate = Date.parse(s);
  if (!Number.isNaN(asDate)) {
    const ms = asDate - Date.now();
    return ms > 0 ? ms : 0;
  }
  return 0;
}

// Sliding-window limiter: ≤RATE_LIMIT_RPS per 1000ms window
class RateLimiter {
  constructor(rps) {
    this.rps = rps;
    this.stamps = [];
  }
  async wait(deadlineMs) {
    for (;;) {
      const now = Date.now();
      if (deadlineMs && now >= deadlineMs) return false;
      // Respect global backoff first
      const remain = getRemainingBackoffMs();
      if (remain > 0) {
        const slice = deadlineMs ? Math.min(remain, Math.max(0, deadlineMs - now)) : remain;
        if (slice > 0) await sleep(slice);
        continue;
      }
      const cutoff = now - 1000;
      while (this.stamps.length && this.stamps[0] <= cutoff) this.stamps.shift();
      if (this.stamps.length < this.rps) {
        this.stamps.push(now);
        return true;
      }
      const waitFor = Math.max(0, this.stamps[0] + 1000 - now);
      const slice = deadlineMs ? Math.min(waitFor, Math.max(0, deadlineMs - now)) : waitFor;
      if (slice > 0) await sleep(slice);
    }
  }
}
const limiter = new RateLimiter(RATE_LIMIT_RPS);

// POST to GHL (rate-limited) + basic retry for 429/5xx
async function postGhl(payload, deadlineMs) {
  const got = await limiter.wait(deadlineMs);
  if (!got) return { ok: false, status: 499, text: 'deadline_exceeded_before_send' };
  const res = await fetch(GHL_CONTACTS_URL, {
    method: 'POST',
    headers: ghlHeaders(),
    body: JSON.stringify(payload)
  });
  const text = await res.text().catch(() => '');
  const retryAfterHeader = res.headers?.get?.('retry-after');
  const retryAfterMs = parseRetryAfterMs(retryAfterHeader);
  return { ok: res.ok, status: res.status, text, retryAfterMs };
}
async function postWithRetry(payload, deadlineMs, maxRetries = 3, baseDelayMs = 500) {
  let attempt = 0;
  let totalRateLimitWaitMs = 0;
  for (;;) {
    if (deadlineMs && Date.now() >= deadlineMs) return { ok: false, status: 499, text: 'deadline_exceeded' };
    const r = await postGhl(payload, deadlineMs);
    if (r.ok) return r;
    if (!(r.status === 429 || (r.status >= 500 && r.status <= 599))) return r;
    // If 429: respect Retry-After header dynamically (plus small buffer)
    if (r.status === 429) {
      const waitMs = Math.min(
        120000,
        Math.max(0, Math.floor((r.retryAfterMs || 0) * 1.1) || 0) // 10% under target to stay slightly below
      );
      if (waitMs > 0) {
        globalBackoffUntil = Date.now() + waitMs;
        totalRateLimitWaitMs += waitMs;
        const remaining = deadlineMs ? Math.max(0, deadlineMs - Date.now()) : waitMs;
        if (remaining <= 0) return { ok: false, status: 499, text: 'deadline_exceeded' };
        await sleep(Math.min(waitMs, remaining));
        // Do not count this as a normal backoff attempt; continue and try again
        continue;
      }
    }
    attempt++;
    if (attempt >= maxRetries) return r;
    const delay = baseDelayMs * Math.pow(2, attempt - 1);
    const remaining = deadlineMs ? Math.max(0, deadlineMs - Date.now()) : delay;
    if (remaining <= 0) return { ok: false, status: 499, text: 'deadline_exceeded' };
    await sleep(Math.min(delay, remaining));
  }
}

// Build a detailed error payload for client-side visibility
function buildErrorPayload(message, e, extra = {}) {
  const out = { error: message };
  if (e && typeof e === 'object') {
    if (e.name) out.name = e.name;
    if (e.code) out.code = e.code;
    if (e.details) out.details = e.details;
    if (e.hint) out.hint = e.hint;
    if (e.step) out.step = e.step;
    if (e.context) out.context = e.context;
  }
  if (extra && Object.keys(extra).length) out.meta = extra;
  return out;
}

// Build GHL payload from queue row
function toGhlPayload(row, tag) {
  const firstName = row.first_name || undefined;
  const lastName =
    row.last_name ||
    (row.full_name && !firstName ? row.full_name.split(' ').slice(1).join(' ') : undefined) ||
    undefined;
  const name = row.full_name || `${row.first_name || ''} ${row.last_name || ''}`.trim() || undefined;
  const e164 = row.e164_phone || toE164US(row.wireless_choice) || undefined;
  const phone = e164 || undefined;
  const email = row.email1 || undefined;

  const payload = {
    locationId: row.location_id,
    firstName,
    lastName,
    name,
    phone,
    email,
    address1: row.address_street || undefined,
    city: row.address_city || undefined,
    state: row.address_state || undefined,
    postalCode: row.address_postal_code || row.zip || undefined,
    country: row.country || 'US',
    source: row.client_contact_id || undefined
  };

  if (tag && String(tag).trim()) {
    payload.tags = [String(tag).trim()]; // EXACTLY ONE
  }
  return payload;
}

// DB updates
async function markRowSuccess(supabase, id) {
  const { error } = await supabase
    .from('contact_queue')
    .update({
      uploaded: true,
      processed_at: new Date().toISOString(),
      status: 'uploaded',
      error: null
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
async function markRowError(supabase, id, message) {
  const { error } = await supabase
    .from('contact_queue')
    .update({
      uploaded: false,
      processed_at: new Date().toISOString(),
      status: 'error',
      error: (message || '').slice(0, 2000)
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

// Fetch up to `limit` pending rows for ZIP, with paging via offset
async function fetchPendingByZip(supabase, zip, limit, offset = 0) {
  const zipped = String(zip).trim();
  // Combine uploaded=false/null with either address_postal_code or zip equal to provided
  // Using nested OR to avoid accidental inclusion of uploaded=true
  const orExpr = [
    `and(uploaded.is.null,address_postal_code.eq.${zipped})`,
    `and(uploaded.eq.false,address_postal_code.eq.${zipped})`,
    `and(uploaded.is.null,zip.eq.${zipped})`,
    `and(uploaded.eq.false,zip.eq.${zipped})`
  ].join(',');
  const { data, error } = await supabase
    .from('contact_queue')
    .select(
      [
        'id',
        'client_contact_id',
        'location_id',
        'first_name',
        'last_name',
        'full_name',
        'email1',
        'e164_phone',
        'wireless_choice',
        'address_street',
        'address_city',
        'address_state',
        'address_postal_code',
        'country',
        'zip',
        'uploaded',
        'status',
        'created_at'
      ].join(',')
    )
    .or(orExpr)
    // Only pull rows that have never been processed in prior runs
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .range(offset, Math.max(offset, offset + limit - 1));

  if (error) {
    const err = new Error(error.message);
    err.name = 'SupabaseQueryError';
    err.code = error.code;
    err.details = error.details;
    err.hint = error.hint;
    err.step = 'fetchPendingByZip';
    err.context = { zip, limit };
    throw err;
  }
  return data || [];
}

// in-run dedupe key
function dedupeKey(row) {
  const phone = row.e164_phone || toE164US(row.wireless_choice) || undefined;
  if (phone) return `loc:${row.location_id}|phone:${phone}`;
  const email = (row.email1 || '').trim().toLowerCase();
  if (email) return `loc:${row.location_id}|email:${email}`;
  const street = (row.address_street || '').trim().toLowerCase();
  const name = (row.full_name || `${row.first_name || ''} ${row.last_name || ''}`).trim().toLowerCase();
  return `loc:${row.location_id}|street:${street}|name:${name}`;
}

// One chunk run (≤ CALL_CAP processed)
async function runChunk({ zip, amount, tag, windowSeconds = 55, concurrency = RATE_LIMIT_RPS }) {
  const supabase = getSupabase();
  const started = Date.now();
  const deadline = started + Math.max(5, Math.min(120, windowSeconds)) * 1000;

  // Hard-cap the per-call processed rows to CALL_CAP
  const limit = Math.max(1, Math.min(CALL_CAP, Number(amount) || CALL_CAP));
  concurrency = Math.max(1, Math.min(RATE_LIMIT_RPS, concurrency));

  let attempted = 0;
  let succeeded = 0;
  let dedupeSkipped = 0;
  const errors = [];
  const errorsByStatus = {};
  let rateLimitWaitMs = 0;
  const seen = new Set();

  // Pull rows, topping up until we have `limit` unique items or run out/time out
  const toProcess = [];
  let offset = 0;
  const pageSize = Math.max(5, limit); // fetch in at least 5s
  while (toProcess.length < limit) {
    if (Date.now() >= deadline) break;
    const batch = await fetchPendingByZip(supabase, zip, pageSize, offset);
    if (!batch.length) break;
    offset += batch.length;
    for (const row of batch) {
      const k = dedupeKey(row);
      if (seen.has(k)) {
        dedupeSkipped++;
        continue;
      }
      seen.add(k);
      toProcess.push(row);
      if (toProcess.length >= limit) break;
    }
    // If batch was small, likely no more rows
    if (batch.length < pageSize) break;
  }

  for (let i = 0; i < toProcess.length; i += concurrency) {
    if (Date.now() >= deadline) break;
    const slice = toProcess.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async (row) => {
        try {
          attempted++;
          if (!row.location_id) {
            await markRowError(supabase, row.id, 'Missing location_id');
            errors.push({ id: row.id, status: 422, text: 'Missing location_id' });
            errorsByStatus['422'] = (errorsByStatus['422'] || 0) + 1;
            return;
          }
          const payload = toGhlPayload(row, tag);
          const res = await postWithRetry(payload, deadline, 3, 500);
          if (res.ok) {
            await markRowSuccess(supabase, row.id);
            succeeded++;
          } else {
            // Try to parse error body for more detail
            let reason = '';
            try {
              const parsed = JSON.parse(res.text || '{}');
              reason = parsed?.message || parsed?.error || parsed?.details || '';
            } catch {
              reason = '';
            }
            const message = `GHL ${res.status}: ${reason || (res.text || '').slice(0, 500)}`;
            await markRowError(supabase, row.id, message);
            errors.push({ id: row.id, status: res.status, text: message });
            errorsByStatus[String(res.status)] = (errorsByStatus[String(res.status)] || 0) + 1;
            // Track rate-limit waits if provided in failed response too
            if (res.status === 429 && res.retryAfterMs) {
              rateLimitWaitMs = Math.max(rateLimitWaitMs, Math.floor(res.retryAfterMs * 1.1));
            }
          }
        } catch (e) {
          // Do not crash entire chunk on per-row failures; record and continue
          const text = (e && e.message) ? e.message : 'row_processing_error';
          try {
            await markRowError(supabase, row.id, text);
          } catch (_) {
            // swallow secondary failure
          }
          errors.push({ id: row.id, status: 500, text });
          errorsByStatus['500'] = (errorsByStatus['500'] || 0) + 1;
        }
      })
    );
    if (Date.now() >= deadline || attempted >= limit) break;
    await sleep(25);
  }

  return {
    zip,
    attempted,
    succeeded,
    failed: attempted - succeeded,
    dedupeSkipped,
    errors,
    errorsSample: errors.slice(0, 10),
    errorsByStatus,
    rate_limit_backoff_ms: Math.max(rateLimitWaitMs, getRemainingBackoffMs()),
    duration_ms: Date.now() - started,
    rate_limit_rps: RATE_LIMIT_RPS,
    call_cap: CALL_CAP,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler – processes a single chunk (≤ 25). Client loops for the rest.
// body: { zip: string, amount?: number, tag?: string }
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const zip = (body?.zip || '').toString().trim();
    const tag = typeof body?.tag === 'string' && body.tag.trim() ? body.tag.trim() : null;
    const requestedAmount = Number.isFinite(body?.amount) ? Math.max(1, Number(body.amount)) : CALL_CAP;

    if (!zip) return json({ error: 'Missing required parameter: zip' }, 400);

    // Per-call cap enforced inside runChunk (≤ CALL_CAP)
    const out = await runChunk({ zip, amount: requestedAmount, tag, windowSeconds: 55, concurrency: RATE_LIMIT_RPS });
    return json(out);
  } catch (e) {
    const payload = buildErrorPayload(e?.message || 'Server error', e, { handler: 'upload-contacts POST' });
    return json(payload, 500);
  }
}
