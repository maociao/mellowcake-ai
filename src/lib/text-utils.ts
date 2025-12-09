/**
 * Trims a response string to a maximum length, ensuring it ends with a complete sentence
 * or a closed action (balanced asterisks).
 * 
 * @param text The text to trim
 * @param maxLength The maximum length in characters (default 800)
 * @returns The trimmed text
 */
export function trimResponse(text: string, maxLength: number = 900): string {
    if (!text || text.length <= maxLength) {
        return text;
    }

    // 1. Initial slice to max length
    let trimmed = text.substring(0, maxLength);

    // 2. Check for balanced asterisks
    // Count asterisks in the trimmed portion
    const asteriskCount = (trimmed.match(/\*/g) || []).length;

    // If odd number of asterisks, we are likely inside an action *...
    // We should trim back to the last asterisk to remove the incomplete action start
    if (asteriskCount % 2 !== 0) {
        const lastAsteriskIndex = trimmed.lastIndexOf('*');
        if (lastAsteriskIndex !== -1) {
            trimmed = trimmed.substring(0, lastAsteriskIndex);
        }
    }

    // 3. Check for sentence termination
    // We want the text to end with a sentence terminator: . ! ? "
    // Or a closed action ending with * (which we might have just handled or preserved)

    // Regex for sentence endings or closed action
    // We look for the last occurrence of a sentence terminator or a closing asterisk
    // Note: If the text ends with *, it's a valid ending (assuming balanced, which we checked above)

    // Let's find the last valid ending punctuation
    // Valid endings: . ! ? " *
    const lastPunctuationIndex = Math.max(
        trimmed.lastIndexOf('.'),
        trimmed.lastIndexOf('!'),
        trimmed.lastIndexOf('?'),
        trimmed.lastIndexOf('"'),
        trimmed.lastIndexOf('*')
    );

    if (lastPunctuationIndex !== -1) {
        // Keep up to and including the punctuation
        trimmed = trimmed.substring(0, lastPunctuationIndex + 1);
    } else {
        // Fallback: If no punctuation found
        // If we trimmed an asterisk (meaning we had an action), we might be left with text that doesn't end in punctuation.
        // e.g. "Action start *looks..." -> "Action start "
        // We should probably just return this, maybe trimming trailing whitespace.

        // If we didn't trim an asterisk (e.g. "I am runn..."), we should trim to last space to avoid cut words.
        const lastSpace = trimmed.lastIndexOf(' ');
        if (lastSpace !== -1) {
            trimmed = trimmed.substring(0, lastSpace);
        }
    }

    return trimmed.trimEnd();
}
