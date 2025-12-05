import { db } from '../src/lib/db';
import { lorebooks } from '../src/lib/db/schema';

async function inspectLorebook() {
    const book = await db.query.lorebooks.findFirst();
    if (book) {
        console.log('Book Name:', book.name);
        console.log('Raw Content Preview:', book.content ? book.content.substring(0, 500) : 'NULL');
        try {
            const json = JSON.parse(book.content || '{}');
            console.log('JSON Keys:', Object.keys(json));
            if (json.entries) {
                console.log('Entries Type:', typeof json.entries);
                console.log('Entries Keys (if object):', Object.keys(json.entries).slice(0, 5));
                console.log('First Entry:', JSON.stringify(Object.values(json.entries)[0], null, 2));
            }
        } catch (e) {
            console.error('JSON Parse Error:', e);
        }
    } else {
        console.log('No lorebooks found.');
    }
}

inspectLorebook();
