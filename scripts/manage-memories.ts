
import { HindsightClient } from '@vectorize-io/hindsight-client';
import { db } from '@/lib/db';
import { chatMessages, chatSessions, personas, characters } from '@/lib/db/schema';
import { eq, asc, desc } from 'drizzle-orm';
import { memoryService } from '@/services/memory-service';

const hindsightUrl = process.env.HINDSIGHT_API_URL || 'http://localhost:8888';

async function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    const characterId = args[1];

    if (!command || !characterId) {
        console.log("Usage:");
        console.log("  npx tsx scripts/manage-memories.ts list-sessions <character_id>");
        console.log("  npx tsx scripts/manage-memories.ts reprocess <character_id> <session_id>");
        console.log("  npx tsx scripts/manage-memories.ts list <character_id>");
        console.log("  npx tsx scripts/manage-memories.ts delete <character_id> <document_id>");
        console.log("  npx tsx scripts/manage-memories.ts export <character_id> [output_file]");
        console.log("  npx tsx scripts/manage-memories.ts import <character_id> <input_file>");
        console.log("  npx tsx scripts/manage-memories.ts clear <character_id>");
        process.exit(1);
    }

    const bankId = `character_${characterId}`;

    if (command === 'list-sessions') {
        console.log(`Listing sessions for character ${characterId}...`);
        try {
            const sessions = await db.select()
                .from(chatSessions)
                .where(eq(chatSessions.characterId, parseInt(characterId)))
                .orderBy(desc(chatSessions.updatedAt))
                .all();

            if (sessions.length === 0) {
                console.log("No sessions found.");
            } else {
                console.log(`Found ${sessions.length} sessions:\n`);
                for (const s of sessions) {
                    console.log(`[ID: ${s.id}] ${s.name || '(No Name)'} (Updated: ${s.updatedAt})`);
                }
            }
        } catch (e) {
            console.error("Failed to list sessions:", e);
        }
    }
    else if (command === 'reprocess') {
        const sessionId = parseInt(args[2]);
        if (!sessionId) { console.error("Missing valid session_id"); process.exit(1); }

        console.log(`Reprocessing session ${sessionId} for character ${characterId}...`);

        try {
            // Avoid Relational Query in CLI context
            const session = await db.select().from(chatSessions).where(eq(chatSessions.id, sessionId)).get();

            if (!session) { console.error("Session not found (in DB)."); process.exit(1); }

            const charData = await db.select().from(characters).where(eq(characters.id, parseInt(characterId))).get();
            const personaData = session.personaId ? await db.select().from(personas).where(eq(personas.id, session.personaId)).get() : null;

            const characterName = charData?.name || 'Assistant';
            const personaName = personaData?.name || 'User';

            console.log(`Context: ${personaName} talking to ${characterName}`);

            // Fetch Messages
            const messages = await db.select()
                .from(chatMessages)
                .where(eq(chatMessages.sessionId, sessionId))
                .orderBy(asc(chatMessages.createdAt))
                .all();

            console.log(`Found ${messages.length} messages.`);
            if (messages.length === 0) return;

            // Iterate and Simulate
            let history: any[] = [];
            let userMsgCount = 0;
            let memoriesGenerated = 0;

            for (let i = 0; i < messages.length; i++) {
                const msg = messages[i];
                history.push({ role: msg.role, content: msg.content, name: msg.name });

                if (msg.role === 'user') {
                    userMsgCount++;
                    // Trigger every 3 user messages (standard logic)
                    if (userMsgCount > 0 && userMsgCount % 3 === 0) {

                        let referenceMsg = msg;

                        // Look ahead: Include the immediate assistant response if present
                        let addedAssistant = false;
                        if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                            const nextMsg = messages[i + 1];
                            history.push({ role: nextMsg.role, content: nextMsg.content, name: nextMsg.name });

                            referenceMsg = nextMsg; // Use the latest message for timestamp
                            i++; // Advance main loop since we consumed this message
                            addedAssistant = true;
                        }

                        // Debug: Show what triggered it
                        const last = history[history.length - 1];
                        console.log(`\n[Trigger #${memoriesGenerated + 1}] User Msg #${userMsgCount}. Context end: [${last.role}] "${last.content.substring(0, 30)}..."`);

                        if (!addedAssistant && i + 1 < messages.length) {
                            console.log(`(Note: Next message was [${messages[i + 1].role}], not assistant. skipped inclusion.)`);
                        }

                        // Parse timestamp from reference message
                        const timestamp = referenceMsg.createdAt ? new Date(referenceMsg.createdAt) : new Date();

                        await memoryService.generateMemoryFromChat(
                            parseInt(characterId),
                            history,
                            [], [],
                            personaName,
                            characterName,
                            timestamp
                        );
                        memoriesGenerated++;
                    }
                }
            }
            console.log(`\nReprocess complete. Generated ${memoriesGenerated} memory triggers.`);

        } catch (e) {
            console.error("Reprocess failed:", e);
        }
    }
    else if (command === 'list') {
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
                        const sourceText = detail.original_text || detail.content || "";
                        console.log(`Content: "${sourceText.substring(0, 300).replace(/\n/g, ' ')}${sourceText.length > 300 ? '...' : ''}"`);
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
    else if (command === 'export') {
        const file = args[2] || `memories_${bankId}.json`;
        console.log(`Exporting memories for ${bankId} to ${file}...`);

        let allDocs: any[] = [];
        let offset = 0;
        const limit = 100;
        let hasMore = true;

        try {
            while (hasMore) {
                const res = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/documents?limit=${limit}&offset=${offset}`);
                if (!res.ok) {
                    if (res.status === 404) {
                        console.log("Bank not found.");
                        break;
                    }
                    throw new Error(`Failed to list: ${res.status}`);
                }
                const json = await res.json();
                const items = json.items || [];

                for (const doc of items) {
                    const detailRes = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/documents/${doc.id}`);
                    if (detailRes.ok) {
                        const detail = await detailRes.json();
                        allDocs.push({
                            id: detail.id,
                            content: detail.original_text || detail.content || '',
                            created_at: detail.created_at,
                            metadata: detail.metadata
                        });
                    }
                }

                if (items.length < limit) {
                    hasMore = false;
                } else {
                    offset += limit;
                }
                process.stdout.write(`Fetched ${allDocs.length} documents...\r`);
            }
            console.log(`\nWriting ${allDocs.length} documents to ${file}...`);
            const fs = await import('fs/promises');
            await fs.writeFile(file, JSON.stringify(allDocs, null, 2));
            console.log("Done.");
        } catch (e) {
            console.error("Export failed:", e);
        }
    }
    else if (command === 'import') {
        const file = args[2];
        if (!file) { console.error("Missing filename"); process.exit(1); }
        console.log(`Importing memories for ${bankId} from ${file}...`);

        try {
            const fs = await import('fs/promises');
            const data = await fs.readFile(file, 'utf-8');
            const docs = JSON.parse(data);

            if (!Array.isArray(docs)) throw new Error("File content must be a JSON array of documents.");

            let success = 0;
            let failed = 0;

            for (const [i, doc] of docs.entries()) {
                if (!doc.content) continue;
                process.stdout.write(`Importing ${i + 1}/${docs.length}...\r`);

                const res = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}/retain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ content: doc.content })
                });

                if (res.ok) success++;
                else failed++;
            }
            console.log(`\nImport complete. Success: ${success}, Failed: ${failed}`);

        } catch (e) {
            console.error("Import failed:", e);
        }
    }
    else if (command === 'clear') {
        console.log(`Clearing memory bank ${bankId}... WARNING: This is irreversible.`);

        try {
            const res = await fetch(`${hindsightUrl}/v1/default/banks/${bankId}`, { method: 'DELETE' });
            if (res.ok || res.status === 404) console.log("Memory bank cleared.");
            else console.log(`Failed to clear: ${res.status}`);
        } catch (e) {
            console.error("Clear failed:", e);
        }
    }
    else {
        console.error("Unknown command.");
    }
}

main().catch(console.error);
