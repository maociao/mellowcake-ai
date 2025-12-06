import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { username, password } = body;

        const validUser = process.env.BASIC_AUTH_USER || 'admin';
        const validPass = process.env.BASIC_AUTH_PASS || 'password';

        if (username === validUser && password === validPass) {
            const token = await signToken({ username });

            const response = NextResponse.json({ success: true });

            response.cookies.set('auth_token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 60 * 60 * 24 * 30, // 30 days
                path: '/',
            });

            return response;
        }

        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    } catch (error) {
        return NextResponse.json({ success: false, message: 'Internal error' }, { status: 500 });
    }
}
