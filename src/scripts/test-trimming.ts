import { trimResponse } from '../lib/text-utils';

function runTests() {
    console.log("Running trimResponse tests...\n");

    const tests = [
        {
            name: "Short text (no change)",
            input: "Hello world.",
            expected: "Hello world."
        },
        {
            name: "Long text, ends with sentence",
            input: "A".repeat(799) + ".",
            expected: "A".repeat(799) + "."
        },
        {
            name: "Long text, cut mid-sentence",
            // "Start. " is 7 chars. 800 - 7 = 793. So we have 793 As.
            // Wait, let's make it simpler.
            // 800 chars.
            // "Sentence one. Sentence two is very long..."
            // If we cut at 800 and it's not a period, we go back to "Sentence one."
            input: "First sentence. " + "A".repeat(800) + " Last sentence.",
            expected: "First sentence." // Should trim back to the first period
        },
        {
            name: "Cut inside action (odd asterisks)",
            input: "Action start *looks at " + "A".repeat(800),
            expected: "Action start" // The * and everything after is removed, and trailing space trimmed
        },
        {
            name: "Cut after closed action",
            input: "Normal text. *Action* " + "A".repeat(800),
            // Cut happens in As. Last valid char is *.
            expected: "Normal text. *Action*"
        },
        {
            name: "Cut inside second action",
            input: "*First action* text *Second action starts " + "A".repeat(800),
            // Cut in As. Asterisks count in first 800 chars: 3 (*First*, *Second...).
            // Odd number. Trim back to last *: "*Second..." -> remove.
            // Result: "*First action* text "
            // Then check punctuation. " " is not punctuation.
            // Wait, logic says: trim back to last asterisk.
            // "text " remains. Last punctuation in "*First action* text " is the second *.
            // So it should result in "*First action*"
            expected: "*First action*"
        }
    ];

    let passed = 0;
    let failed = 0;

    tests.forEach((test, index) => {
        // Construct inputs dynamically if needed to ensure length
        let input = test.input;

        // For the "Long text" cases, let's be precise
        if (test.name === "Long text, cut mid-sentence") {
            // 15 chars "First sentence."
            // We want the cut to happen after this, but before the next period.
            // So we pad with chars until > 800, but no periods.
            input = "First sentence." + "A".repeat(800);
            // trimResponse(815 chars) -> slice 800 -> "First sentence." + 785 As.
            // Last punctuation is the period at index 14.
            // Result: "First sentence."
        }

        const result = trimResponse(input, 800);

        // Simple assertion
        // For long strings, strict equality might be annoying to debug, but let's try.
        // For the "Cut inside second action" case:
        // Input: "*First action* text *Second action starts " + As
        // Slice 800: "*First action* text *Second action starts AAAAA..."
        // Asterisks: 3. Odd.
        // Trim to last *: "*First action* text " (removed "*Second...")
        // Now check punctuation in "*First action* text "
        // Last punctuation is the 2nd * at end of "action*".
        // Result: "*First action*"

        if (result === test.expected) {
            console.log(`✅ Test ${index + 1}: ${test.name} PASSED`);
            passed++;
        } else {
            console.log(`❌ Test ${index + 1}: ${test.name} FAILED`);
            console.log(`   Expected: "${test.expected}"`);
            console.log(`   Actual:   "${result}"`);
            failed++;
        }
    });

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
}

runTests();
