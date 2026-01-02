import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { extractTextFromHTML } from "@/text/converters/html-text-extractor";

describe("html-text-extractor", () => {
    test("extracts text from simple HTML", async () => {
        const html = "<div>Hello <b>World</b></div>";
        const result = await Effect.runPromise(extractTextFromHTML(html));
        expect(result).toBe("Hello World");
    });

    test("removes script tags", async () => {
        const html = "<div>Hello<script>alert('bad')</script> World</div>";
        const result = await Effect.runPromise(extractTextFromHTML(html));
        expect(result).toBe("Hello World");
    });

    test("removes style tags", async () => {
        const html = "<div>Hello<style>body { color: red; }</style> World</div>";
        const result = await Effect.runPromise(extractTextFromHTML(html));
        expect(result).toBe("Hello World");
    });

    test("handles extra whitespace", async () => {
        const html = `
            <div>
                Hello
                <span>World</span>
            </div>
        `;
        const result = await Effect.runPromise(extractTextFromHTML(html));
        expect(result).toBe("Hello World");
    });

    test("handles empty input", async () => {
        const html = "";
        const result = await Effect.runPromise(extractTextFromHTML(html));
        expect(result).toBe("");
    });
});
