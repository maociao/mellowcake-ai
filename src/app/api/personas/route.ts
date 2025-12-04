import { NextResponse } from 'next/server';
import { getPersonas } from '@/lib/sillytavern';

export async function GET() {
    try {
        const personas = await getPersonas();
        return NextResponse.json(personas);
    } catch (error) {
        console.error('Error fetching personas:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
