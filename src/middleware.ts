import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { verifyToken } from '@/lib/auth';

export async function middleware(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Allow access to login page and static assets
    if (pathname === '/login' || pathname.startsWith('/_next') || pathname.startsWith('/api/auth')) {
        return NextResponse.next();
    }

    const token = req.cookies.get('auth_token')?.value;

    if (!token || !(await verifyToken(token))) {
        const loginUrl = new URL('/login', req.url);
        return NextResponse.redirect(loginUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|workbox-.*|icons/|offline.html|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.mp4|.*\\.webm|api/characters).*)'],
};
