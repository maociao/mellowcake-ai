import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const logPath = path.join(process.cwd(), 'performance.log');

        if (!fs.existsSync(logPath)) {
            return NextResponse.json({ logs: [] });
        }

        const fileStream = fs.createReadStream(logPath);
        const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
        });

        const logs: any[] = [];

        for await (const line of rl) {
            if (line.trim()) {
                try {
                    logs.push(JSON.parse(line));
                } catch (e) {
                    console.warn('Failed to parse log line:', line);
                }
            }
        }

        // Return most recent first
        return NextResponse.json({ logs: logs.reverse() });

    } catch (error) {
        console.error('Error reading performance logs:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
