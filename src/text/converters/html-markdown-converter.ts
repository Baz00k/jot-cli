import { Effect } from "effect";
import TurndownService from "turndown";
import { ConversionError } from "@/domain/errors";

export const convertHTMLToMarkdown = (html: string) =>
    Effect.gen(function* () {
        const turndownService = new TurndownService({
            headingStyle: "atx",
            codeBlockStyle: "fenced",
        });

        turndownService.remove(["script", "noscript", "style", "meta", "link"]);

        return yield* Effect.try({
            try: () => turndownService.turndown(html),
            catch: (error) =>
                new ConversionError({
                    message: `Failed to convert to markdown: ${error}`,
                    cause: error,
                }),
        });
    });
