import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — hard-coded Supabase details (server-only)
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://upxztevetixqwlzpnjfv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVweHp0ZXZldGl4cXdsenBuamZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0OTI1MjQsImV4cCI6MjA3NTA2ODUyNH0.I-geY9rd_7vcqhsktT2pUeo9-tnA-087ic3W1Qtw-Sw';
const TABLE_NAME = 'contact_queue';
const OLD_TAG_3_VALUE = 'modern';
const INSERT_BATCH_SIZE = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// Supabase client (server-side)
// ─────────────────────────────────────────────────────────────────────────────
function getSupabase() {
	return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
		global: { headers: { 'x-client-info': 'pull-lists-csv-web' } }
	});
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (aligned with provided Node script)
// ─────────────────────────────────────────────────────────────────────────────
function isValidZip(zip: unknown): boolean {
	return /^\d{5}(-\d{4})?$/.test((zip || '') as string);
}

function normalizeAddress(addr: unknown): string {
	return (addr ? String(addr) : '').trim().toLowerCase();
}

function normalizeFirstName(name: unknown): string {
	const s = (name ? String(name) : '').trim();
	return s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : '';
}

function toE164US(phone: unknown): string | undefined {
	if (!phone) return undefined;
	const raw = String(phone);
	const digits = raw.replace(/\D+/g, '');
	if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
	if (digits.length === 10) return `+1${digits}`;
	if (raw.startsWith('+')) return raw;
	return undefined;
}

function chooseWireless(row: Record<string, unknown>): string | null {
	for (let i = 1; i <= 10; i++) {
		const p = row[`phone${i}`]?.toString().trim();
		const t = row[`phone${i}_type`]?.toString().trim().toUpperCase();
		if (t === 'W' && p) return p;
	}
	return null;
}

function parsePropertyAddress(addrRaw: unknown): {
	street?: string;
	city?: string;
	state?: string;
	zip?: string;
} {
	const out: { street?: string; city?: string; state?: string; zip?: string } = {};
	if (!addrRaw) return out;
	const s = String(addrRaw).trim();
	const parts = s.split(',').map(p => p.trim()).filter(Boolean);
	if (parts.length >= 1) out.street = parts[0];
	if (parts.length >= 2) out.city = parts[1];
	const tail = parts.length >= 3 ? parts[2] : parts.length >= 2 ? parts[1] : '';
	let m = /([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)/.exec(tail);
	if (m) {
		out.state = m[1].toUpperCase();
		out.zip = m[2];
	}
	if (!out.state || !out.zip) {
		m = /([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/.exec(s);
		if (m) {
			out.state = out.state || m[1].toUpperCase();
			out.zip = out.zip || m[2];
		}
	}
	return out;
}

function cleanRows(rawRows: Record<string, unknown>[]) {
	const kept: Record<string, unknown>[] = [];
	const seenAddr = new Set<string>();
	for (const row of rawRows) {
		const wireless = chooseWireless(row);
		if (!wireless) continue;
		const addrNorm = normalizeAddress(row.propertyAddress);
		if (addrNorm && seenAddr.has(addrNorm)) continue;
		const cleaned = { ...row };
		(cleaned as any).firstName = normalizeFirstName(row.firstName);
		(cleaned as any).wireless_choice = wireless;
		if (addrNorm) seenAddr.add(addrNorm);
		kept.push(cleaned);
	}
	return kept;
}

function toQueueRow(
	cleaned: Record<string, any>,
	clientContactId: string,
	locationId: string
) {
	const firstName: string = cleaned.firstName ?? '';
	const lastName: string = cleaned.lastName ?? '';
	const fullName = `${firstName || ''} ${lastName || ''}`.trim() || null;
	const addressFull = cleaned.propertyAddress || null;
	const parsed = parsePropertyAddress(addressFull);
	const postalCode = parsed.zip && isValidZip(parsed.zip) ? parsed.zip : null;
	const e164 = toE164US(cleaned.wireless_choice);

	const email1 = cleaned.email1 ?? null;
	const email2 = cleaned.email2 ?? null;
	const email3 = cleaned.email3 ?? null;
	const phone1 = cleaned.phone1 ?? null;
	const phone1_type = cleaned.phone1_type ?? null;
	const phone2 = cleaned.phone2 ?? null;
	const phone2_type = cleaned.phone2_type ?? null;
	const phone3 = cleaned.phone3 ?? null;
	const phone3_type = cleaned.phone3_type ?? null;

	return {
		client_contact_id: clientContactId,
		location_id: locationId,
		zip: postalCode ?? null,
		first_name: firstName || null,
		last_name: lastName || null,
		full_name: fullName,
		email1,
		email2,
		email3,
		phone1,
		phone1_type,
		phone2,
		phone2_type,
		phone3,
		phone3_type,
		wireless_choice: cleaned.wireless_choice ?? null,
		e164_phone: e164 ?? null,
		property_address: addressFull,
		address_street: parsed.street ?? null,
		address_city: parsed.city ?? null,
		address_state: parsed.state ?? null,
		address_postal_code: postalCode ?? null,
		country: 'US',
		source: 'csv pull-lists web',
		status: 'pending',
		error: null,
		old_tag_3: OLD_TAG_3_VALUE,
		raw_data: cleaned
	};
}

async function fetchExistingByZips(
	supabase: ReturnType<typeof getSupabase>,
	zips: string[]
) {
	const zipList = Array.from(new Set(zips.filter(z => isValidZip(z))));
	const CHUNK = 100;
	const existing: { address_postal_code?: string | null; e164_phone?: string | null; property_address?: string | null }[] = [];
	for (let i = 0; i < zipList.length; i += CHUNK) {
		const chunk = zipList.slice(i, i + CHUNK);
		const { data, error } = await supabase
			.from(TABLE_NAME)
			.select('address_postal_code,e164_phone,property_address')
			.in('address_postal_code', chunk);
		if (error) {
			throw new Error(`Supabase select failed: ${error.message}`);
		}
		if (data?.length) existing.push(...data);
	}
	return existing;
}

function buildExistingSets(existingRows: { address_postal_code?: string | null; e164_phone?: string | null; property_address?: string | null }[]) {
	const byZipAndE164 = new Set<string>();
	const byZipAndAddr = new Set<string>();
	for (const r of existingRows) {
		const zip = r.address_postal_code || null;
		const e = r.e164_phone || null;
		const addrNorm = normalizeAddress(r.property_address);
		if (zip && e) byZipAndE164.add(`${zip}__${e}`);
		if (zip && addrNorm) byZipAndAddr.add(`${zip}__${addrNorm}`);
	}
	return { byZipAndE164, byZipAndAddr };
}

async function upsertPulledZips(
	supabase: ReturnType<typeof getSupabase>,
	clientContactId: string,
	locationId: string,
	zips: string[]
) {
	const zipList = Array.from(new Set(zips.filter(z => isValidZip(z))));
	if (zipList.length === 0) return { created: 0 };
	// Fetch existing rows for this contact+location for these zips
	const { data: existing, error: selErr } = await supabase
		.from('pulled_zips')
		.select('zip')
		.eq('client_contact_id', clientContactId)
		.eq('location_id', locationId)
		.in('zip', zipList);
	if (selErr) {
		throw new Error(`Supabase select pulled_zips failed: ${selErr.message}`);
	}
	const existingSet = new Set<string>((existing || []).map(r => (r as any).zip).filter(Boolean));
	const missing = zipList.filter(z => !existingSet.has(z));
	if (missing.length === 0) return { created: 0 };
	const rows = missing.map(z => ({
		client_contact_id: clientContactId,
		location_id: locationId,
		zip: z
	}));
	const { error: insErr, count } = await supabase
		.from('pulled_zips')
		.insert(rows, { count: 'exact' });
	if (insErr) {
		throw new Error(`Supabase insert pulled_zips failed: ${insErr.message}`);
	}
	return { created: typeof count === 'number' ? count : rows.length };
}

function readCsvRowsFromString(rawCsv: string) {
	const records = parse(rawCsv, {
		columns: true,
		skip_empty_lines: true,
		trim: true
	}) as Record<string, unknown>[];
	return records.map(r => {
		const out: Record<string, unknown> = { ...r };
		for (let i = 1; i <= 10; i++) {
			const pKey = `phone${i}`;
			const tKey = `phone${i}_type`;
			if (!(pKey in out)) out[pKey] = '';
			if (!(tKey in out)) out[tKey] = '';
		}
		for (let i = 1; i <= 3; i++) {
			const eKey = `email${i}`;
			if (!(eKey in out)) out[eKey] = '';
		}
		if (!('firstName' in out)) out.firstName = '';
		if (!('lastName' in out)) out.lastName = '';
		if (!('propertyAddress' in out)) out.propertyAddress = '';
		return out;
	});
}

async function insertBatch(
	supabase: ReturnType<typeof getSupabase>,
	rows: any[]
) {
	if (!rows.length) return { inserted: 0, failed: 0, errors: [] as { batchStart: number; message: string }[] };
	let inserted = 0;
	const errors: { batchStart: number; message: string }[] = [];
	for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
		const slice = rows.slice(i, i + INSERT_BATCH_SIZE);
		const { error, count } = await supabase.from(TABLE_NAME).insert(slice, { count: 'exact' });
		if (error) {
			errors.push({ batchStart: i, message: error.message });
		} else {
			inserted += typeof count === 'number' ? count : slice.length;
		}
	}
	return { inserted, failed: rows.length - inserted, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/upload
// form-data: file (csv), client_contact_id, location_id
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
	try {
		const form = await req.formData();
		const file = form.get('file') as File | null;
		const clientContactId = (form.get('client_contact_id') || '').toString().trim();
		const locationId = (form.get('location_id') || '').toString().trim();
		if (!file) {
			return NextResponse.json({ error: 'Missing CSV file' }, { status: 400 });
		}
		if (!clientContactId || !locationId) {
			return NextResponse.json({ error: 'Both client_contact_id and location_id are required' }, { status: 400 });
		}

		// 1) Read CSV
		const buf = Buffer.from(await file.arrayBuffer());
		const csvText = buf.toString('utf8');
		const rawRows = readCsvRowsFromString(csvText);
		const totalRead = rawRows.length;

		// 2) Clean
		const cleaned = cleanRows(rawRows);

		// 3) Map to payloads
		const payloads = cleaned.map(r => toQueueRow(r as any, clientContactId, locationId));

		// 4) Collect zips
		const zips = Array.from(new Set(payloads.map(p => p.address_postal_code).filter((z: string | null) => z && isValidZip(z)) as string[]));

		// 5) Load existing for those zips
		const supabase = getSupabase();
		const existing = zips.length ? await fetchExistingByZips(supabase, zips) : [];
		const { byZipAndE164, byZipAndAddr } = buildExistingSets(existing);

		// 6) Filter duplicates by rule
		const toInsert: any[] = [];
		let skippedAsDuplicate = 0;
		for (const row of payloads) {
			const zip = row.address_postal_code || null;
			const e = row.e164_phone || null;
			const addrNorm = normalizeAddress(row.property_address);
			const dupByPhone = zip && e && byZipAndE164.has(`${zip}__${e}`);
			const dupByAddr = zip && addrNorm && byZipAndAddr.has(`${zip}__${addrNorm}`);
			if (dupByPhone || dupByAddr) {
				skippedAsDuplicate++;
				continue;
			}
			toInsert.push(row);
		}

		// 7) Insert
		const { inserted, failed, errors } = await insertBatch(supabase, toInsert);

		// 9) Ensure pulled_zips has entries for these zips for this contact+location
		let pulledZipsCreated = 0;
		if (zips.length) {
			const res = await upsertPulledZips(supabase, clientContactId, locationId, zips as string[]);
			pulledZipsCreated = res.created;
		}

		// 8) Summary
		return NextResponse.json({
			summary: {
				read_from_csv: totalRead,
				kept_after_clean: cleaned.length,
				duplicates_skipped_db: skippedAsDuplicate,
				attempted_to_insert: toInsert.length,
				inserted_successfully: inserted,
				failed_inserts: failed,
				pulled_zips_created: pulledZipsCreated
			},
			errors: errors.slice(0, 10)
		});
	} catch (err: any) {
		return NextResponse.json(
			{ error: err?.message || 'Unknown error' },
			{ status: 500 }
		);
	}
}


