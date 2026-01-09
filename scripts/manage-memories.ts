
import { HindsightClient } from '@vectorize-io/hindsight-client';

const hindsightUrl = process.env.HINDSIGHT_API_URL || 'http://localhost:8888';

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const characterId = args[1];

    if (!command || !characterId) {
        console.log("Usage:");
        console.log("  npx tsx scripts/manage-memories.ts list <character_id>");
        console.log("  npx tsx scripts/manage-memories.ts delete <character_id> <document_id>");
        process.exit(1);
    }

    const bankId = `character_${characterId}`;

    if (command === 'list') {
        console.log(`\nListing documents for ${bankId}...`);
        try {
            const res = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/documents?limit=100`);
            if (!res.ok) {
                console.error(`Error listing: ${res.status} ${await res.text()}`);
                return;
            }
            const json = await res.json();
            const docs = json.items || [];

            if (docs.length === 0) {
                console.log("No documents found.");
                return;
            }

            console.log(`Found ${docs.length} documents:\n`);

            for (const doc of docs) {
                console.log(`[Document ID: ${doc.id}]`);
                console.log(`Created: ${doc.created_at}`);

                // Fetch details to get full content
                try {
                    const detailRes = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/documents/${doc.id}`);
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        // Use original_text per debug findings
                        const sourceText = detail.original_text || detail.content || "";

                        console.log(`Content: "${sourceText.substring(0, 300).replace(/\n/g, ' ')}${sourceText.length > 300 ? '...' : ''}"`);

                        // Note: Document detail endpoint doesn't return memory_units array, only count.
                        if (detail.memory_unit_count) console.log(`Memory Units: ${detail.memory_unit_count}`);

                    } else {
                        console.log(`(Failed to fetch details: ${detailRes.status})`);
                    }
                } catch (e) {
                    console.log("  (Failed to fetch details)");
                }
                console.log("-".repeat(40));
            }
        } catch (e) {
            console.error("Failed to list:", e);
        }
    }
    else if (command === 'delete') {
        const docId = args[2];
        if (!docId) { console.error("Error: Missing document_id"); process.exit(1); }
        console.log(`Deleting document ${docId} from ${bankId}...`);
        try {
            const res = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/documents/${docId}`, { method: 'DELETE' });
            if (!res.ok) {
                console.error(`Error: ${res.status}`);
            } else {
                console.log("Success: Document deleted.");
            }
        } catch (e) { console.error("Failed:", e); }
    }
    else {
        console.error("Unknown command.");
    }
}

main().catch(console.error);
