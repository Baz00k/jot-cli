import { Stream } from "effect";
import type { Replacer } from ".";

export const MultiOccurrenceReplacer: Replacer = (content, find) =>
    Stream.fromIterable(
        (function* () {
            // This replacer yields all exact matches, allowing the replace function
            // to handle multiple occurrences based on replaceAll parameter
            let startIndex = 0;

            while (true) {
                const index = content.indexOf(find, startIndex);
                if (index === -1) break;

                yield find;
                startIndex = index + find.length;
            }
        })(),
    );
