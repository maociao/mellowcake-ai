import { db } from '../src/lib/db';
import { personas } from '../src/lib/db/schema';
import { eq } from 'drizzle-orm';

async function main() {
    // Fix Jack Dawson
    await db.update(personas)
        .set({ name: 'Jack Dawson' })
        .where(eq(personas.name, '1764434773784-JackDawson'));

    // Fix Matt (assuming user-default is Matt)
    await db.update(personas)
        .set({ name: 'Matt' })
        .where(eq(personas.name, 'user-default'));

    console.log('Personas updated.');
}

main();
