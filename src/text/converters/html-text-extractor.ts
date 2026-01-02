import { Effect } from "effect";
import { HTMLRewriter } from "htmlrewriter";
import { ConversionError } from "@/domain/errors";

export const extractTextFromHTML = (html: string) =>
    Effect.gen(function* () {
        const cleanHtml = yield* Effect.promise(() =>
            new HTMLRewriter()
                .on("script, noscript, style, iframe, object, embed, svg", {
                    element(element) {
                        element.remove();
                    },
                })
                .transform(new Response(html))
                .text(),
        ).pipe(
            Effect.mapError(
                (error) =>
                    new ConversionError({
                        message: `Failed to sanitize HTML: ${error}`,
                        cause: error,
                    }),
            ),
        );

        let text = "";
        yield* Effect.promise(() =>
            new HTMLRewriter()
                .on("*", {
                    text(chunk) {
                        if (chunk.text) {
                            text += chunk.text;
                        }
                    },
                })
                .transform(new Response(cleanHtml))
                .text(),
        ).pipe(
            Effect.mapError(
                (error) =>
                    new ConversionError({
                        message: `Failed to extract text: ${error}`,
                        cause: error,
                    }),
            ),
        );

        return text.replace(/\s+/g, " ").trim();
    });
