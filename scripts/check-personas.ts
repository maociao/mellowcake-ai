import { db } from '../src/lib/db';
import { personas } from '../src/lib/db/schema';

async function main() {
    const allPersonas = await db.select().from(personas);
    console.log(JSON.stringify(allPersonas, null, 2));
}

main();
