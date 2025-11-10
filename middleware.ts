import { NextRequest, NextResponse } from 'next/server';

export default function middleware(req: NextRequest) {
	const { pathname } = req.nextUrl;
	const isLogin = pathname === '/login';
	const isAuthApi = pathname.startsWith('/api/auth');
	const authed = req.cookies.get('auth')?.value === '1';

	// Allow auth endpoint
	if (isAuthApi) return NextResponse.next();

	// If not authenticated:
	if (!authed) {
		// Block API calls with 401
		if (pathname.startsWith('/api')) {
			return new NextResponse(JSON.stringify({ error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		// Redirect pages to /login
		if (!isLogin) {
			const url = req.nextUrl.clone();
			url.pathname = '/login';
			return NextResponse.redirect(url);
		}
		return NextResponse.next();
	}

	// If authenticated and visiting /login, redirect home
	if (authed && isLogin) {
		const url = req.nextUrl.clone();
		url.pathname = '/';
		return NextResponse.redirect(url);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		// apply to all paths except static files
		'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)).*)'
	]
};


