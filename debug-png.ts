import fs from 'fs';
import path from 'path';

const filePath = '/home/mellowcake/Code/SillyTavern/data/default-user/User Avatars/1764434773784-JackDawson.png';

function extractPngMetadata(buffer: Buffer) {
    if (buffer.readUInt32BE(0) !== 0x89504E47 || buffer.readUInt32BE(4) !== 0x0D0A1A0A) {
        console.log('Invalid PNG signature');
        return;
    }

    let offset = 8;
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);

        console.log(`Chunk: ${type}, Length: ${length}`);

        if (type === 'tEXt') {
            const dataStart = offset + 8;
            const dataEnd = dataStart + length;
            const data = buffer.subarray(dataStart, dataEnd);

            const nullIndex = data.indexOf(0);
            if (nullIndex !== -1) {
                const keyword = data.toString('ascii', 0, nullIndex);
                console.log(`  Keyword: ${keyword}`);
                const text = data.toString('utf8', nullIndex + 1);
                console.log(`  Text (first 100 chars): ${text.substring(0, 100)}...`);
            }
        }

        offset += 12 + length;
    }
}

const buffer = fs.readFileSync(filePath);
extractPngMetadata(buffer);
