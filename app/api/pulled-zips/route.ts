import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://upxztevetixqwlzpnjfv.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVweHp0ZXZldGl4cXdsenBuamZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0OTI1MjQsImV4cCI6MjA3NTA2ODUyNH0.I-geY9rd_7vcqhsktT2pUeo9-tnA-087ic3W1Qtw-Sw';
const FIXED_LOCATION_ID = 'Ypfq5TDjEbkz5WdFRLgt';

function getSupabase() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
    global: { headers: { 'x-client-info': 'pulled-zips-web' } }
  });
}

function isValidZip(zip: string) {
  return /^\d{5}(-\d{4})?$/.test(zip);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const clientContactId = (body?.client_contact_id || '').toString().trim();
    const locationId = FIXED_LOCATION_ID;
    const zip = (body?.zip || '').toString().trim();
    if (!clientContactId) {
      return NextResponse.json({ error: 'Missing client_contact_id' }, { status: 400 });
    }
    if (!zip) {
      return NextResponse.json({ error: 'Missing zip' }, { status: 400 });
    }
    if (!isValidZip(zip)) {
      return NextResponse.json({ error: 'Invalid zip format' }, { status: 400 });
    }
    const supabase = getSupabase();
    const { data: existing, error: selErr } = await supabase
      .from('pulled_zips')
      .select('id')
      .eq('client_contact_id', clientContactId)
      .eq('location_id', locationId)
      .eq('zip', zip)
      .limit(1);
    if (selErr) {
      return NextResponse.json({ error: selErr.message }, { status: 500 });
    }
    if (existing && existing.length > 0) {
      return NextResponse.json({ created: 0, exists: true });
    }
    const { error: insErr } = await supabase
      .from('pulled_zips')
      .insert([{ client_contact_id: clientContactId, location_id: locationId, zip }]);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ created: 1, exists: false });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
  }
}


