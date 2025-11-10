import { NextRequest, NextResponse } from 'next/server';

const PASSWORD = 'zitoo';

export async function POST(req: NextRequest) {
	try {
		const body = await req.json().catch(() => ({}));
		const pw = (body?.password || '').toString();
		if (pw !== PASSWORD) {
			return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
		}
		const res = NextResponse.json({ ok: true });
		res.cookies.set('auth', '1', {
			httpOnly: true,
			secure: process.env.NODE_ENV === 'production',
			sameSite: 'lax',
			path: '/',
			maxAge: 60 * 60 * 24 * 7 // 7 days
		});
		return res;
	} catch (e: any) {
		return NextResponse.json({ error: e?.message || 'Unknown error' }, { status: 500 });
	}
}


