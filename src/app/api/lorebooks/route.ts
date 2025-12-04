import { NextResponse } from 'next/server';
import { getLorebooks } from '@/lib/sillytavern';

export async function GET() {
    const lorebooks = await getLorebooks();
    return NextResponse.json(lorebooks);
}
