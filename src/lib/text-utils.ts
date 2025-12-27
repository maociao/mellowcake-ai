/**
 * Trims a response string to a maximum length, ensuring it ends with a complete sentence
 * or a closed action (balanced asterisks).
 * 
 * @param text The text to trim
 * @param maxLength The maximum length in characters (default 800)
 * @returns The trimmed text
 */
export function trimResponse(text: string, maxLength: number = 800): string {
    if (!text || text.length <= maxLength) {
        return text;
    }

    let cutOffIndex = maxLength;

    // 1. Check for Image/Generation Tags that might be cut off
    // We look for the start of a tag near the cutoff point
    const tags = ['[GENERATE_IMAGE:', '!['];

    for (const tagStart of tags) {
        // Find the last occurrence of the tag start *before or at* the current cutoff
        const lastIndex = text.lastIndexOf(tagStart, cutOffIndex);

        if (lastIndex !== -1) {
            // Determine expected closing char
            const closeChar = tagStart === '[GENERATE_IMAGE:' ? ']' : ')';

            // OPTIMIZATION: Check if there is a closing char AFTER the current cutoff
            // This handles cases where the tag is very long or contains nested brackets
            // We search for the first closer after the cutoff
            const candidateCloseIndex = text.indexOf(closeChar, cutOffIndex);

            if (candidateCloseIndex !== -1) {
                // Verify this closer belongs to OUR tag and not a subsequent one
                // Check if any OTHER tag formatting starts between our start and this candidate close
                // We only care about the specific tags we track
                let hasInterveningTag = false;
                for (const otherTag of tags) {
                    const intervention = text.indexOf(otherTag, lastIndex + 1);
                    if (intervention !== -1 && intervention < candidateCloseIndex) {
                        hasInterveningTag = true;
                        break;
                    }
                }

                if (!hasInterveningTag) {
                    // Safe to extend!
                    cutOffIndex = candidateCloseIndex + 1;
                    continue; // Done with this tag type, check others (though usually order matters less here)
                }
            }

            // Fallback: Standard search (if the tag actually ended before cutoff, or we found an conflict)
            const closeIndex = text.indexOf(closeChar, lastIndex);
            if (closeIndex !== -1 && closeIndex >= cutOffIndex) {
                cutOffIndex = closeIndex + 1;
            }
        }
    }

    // 2. Initial slice
    let trimmed = text.substring(0, cutOffIndex);

    // 3. Check for balanced asterisks
    const asteriskCount = (trimmed.match(/\*/g) || []).length;
    if (asteriskCount % 2 !== 0) {
        const lastAsteriskIndex = trimmed.lastIndexOf('*');
        if (lastAsteriskIndex !== -1) {
            trimmed = trimmed.substring(0, lastAsteriskIndex);
        }
    }

    // 4. Check for sentence termination
    // Valid endings now include ] and ) to support tags being the end of the thought
    const lastPunctuationIndex = Math.max(
        trimmed.lastIndexOf('.'),
        trimmed.lastIndexOf('!'),
        trimmed.lastIndexOf('?'),
        trimmed.lastIndexOf('"'),
        trimmed.lastIndexOf('*'),
        trimmed.lastIndexOf(']'),
        trimmed.lastIndexOf(')')
    );

    if (lastPunctuationIndex !== -1) {
        trimmed = trimmed.substring(0, lastPunctuationIndex + 1);
    } else {
        // Fallback
        const lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace !== -1) {
            trimmed = trimmed.substring(0, lastSpace);
        }
    }

    return trimmed.trimEnd();
}
