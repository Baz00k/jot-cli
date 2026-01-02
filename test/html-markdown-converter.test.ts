import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { convertHTMLToMarkdown } from "@/text/converters/html-markdown-converter";

describe("html-markdown-converter", () => {
    test("converts headers to markdown", async () => {
        const html = "<h1>Title</h1><h2>Subtitle</h2>";
        const result = await Effect.runPromise(convertHTMLToMarkdown(html));
        expect(result).toBe("# Title\n\n## Subtitle");
    });

    test("converts links to markdown", async () => {
        const html = '<a href="https://example.com">Link</a>';
        const result = await Effect.runPromise(convertHTMLToMarkdown(html));
        expect(result).toBe("[Link](https://example.com)");
    });

    test("converts lists to markdown", async () => {
        const html = "<ul><li>Item 1</li><li>Item 2</li></ul>";
        const result = await Effect.runPromise(convertHTMLToMarkdown(html));
        expect(result).toContain("*   Item 1");
        expect(result).toContain("*   Item 2");
    });

    test("removes script tags", async () => {
        const html = "<div>Content<script>alert('x')</script></div>";
        const result = await Effect.runPromise(convertHTMLToMarkdown(html));
        expect(result).toBe("Content");
    });

    test("handles code blocks", async () => {
        const html = "<pre><code>console.log('hello')</code></pre>";
        const result = await Effect.runPromise(convertHTMLToMarkdown(html));
        expect(result).toContain("```\nconsole.log('hello')\n```");
    });
});
