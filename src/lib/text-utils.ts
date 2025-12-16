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

            // Find where it closes (searching forward from the start)
            const closeIndex = text.indexOf(closeChar, lastIndex);

            // If it closes AFTER the cutoff, ensuring the tag is complete is prioritized
            // We extend the cutoff to include the closing character
            if (closeIndex !== -1 && closeIndex >= cutOffIndex) {
                // Check if extending is reasonable (e.g. don't extend by 1000 chars, but a prompt shouldn't be that massive)
                // Let's blindly trust it for now as per user request to "exceed the character length"
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
