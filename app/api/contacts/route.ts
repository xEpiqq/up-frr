import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://upxztevetixqwlzpnjfv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVweHp0ZXZldGl4cXdsenBuamZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0OTI1MjQsImV4cCI6MjA3NTA2ODUyNH0.I-geY9rd_7vcqhsktT2pUeo9-tnA-087ic3W1Qtw-Sw';

function getSupabase() {
	return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
		auth: { persistSession: false },
		global: { headers: { 'x-client-info': 'contacts-list-web' } }
	});
}

export async function GET(_req: NextRequest) {
	try {
		const supabase = getSupabase();
		const { data, error } = await supabase
			.from('jordan_contacts')
			.select('contact_id,full_name,first_name,last_name');
		if (error) {
			return NextResponse.json({ error: error.message }, { status: 500 });
		}
		const seen = new Set<string>();
		const contacts = (data || [])
			.filter((r: any) => r.contact_id && typeof r.contact_id === 'string')
			.map((r: any) => {
				const label =
					(r.full_name && String(r.full_name).trim()) ||
					([r.first_name, r.last_name].filter(Boolean).join(' ').trim()) ||
					r.contact_id;
				return { id: r.contact_id as string, label: label as string };
			})
			.filter(c => {
				if (seen.has(c.id)) return false;
				seen.add(c.id);
				return true;
			})
			.sort((a, b) => a.label.localeCompare(b.label));
		return NextResponse.json({ contacts });
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
	}
}


