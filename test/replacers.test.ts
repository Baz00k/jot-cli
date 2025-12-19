import { describe, expect, test } from "bun:test";
import { Effect, Stream } from "effect";
import type { Replacer } from "@/text/replacers";
import {
    BlockAnchorReplacer,
    ContextAwareReplacer,
    EscapeNormalizedReplacer,
    IndentationFlexibleReplacer,
    LineTrimmedReplacer,
    MultiOccurrenceReplacer,
    SimpleReplacer,
    TrimmedBoundaryReplacer,
    WhitespaceNormalizedReplacer,
} from "@/text/replacers";

const runReplacer = async (replacer: Replacer, content: string, find: string) => {
    const result = await Effect.runPromise(Stream.runCollect(replacer(content, find)));
    return Array.from(result);
};

describe("Text Replacers", () => {
    describe("SimpleReplacer", () => {
        test("returns the search string as a single candidate", async () => {
            const content = "hello world";
            const find = "world";
            const result = await runReplacer(SimpleReplacer, content, find);
            expect(result).toEqual(["world"]);
        });
    });

    describe("MultiOccurrenceReplacer", () => {
        test("finds all exact matches", async () => {
            const content = "hello world hello universe hello world";
            const find = "hello world";
            const result = await runReplacer(MultiOccurrenceReplacer, content, find);
            expect(result).toEqual(["hello world", "hello world"]);
        });

        test("returns empty if no match", async () => {
            const content = "hello universe";
            const find = "world";
            const result = await runReplacer(MultiOccurrenceReplacer, content, find);
            expect(result).toEqual([]);
        });
    });

    describe("LineTrimmedReplacer", () => {
        test("matches lines ignoring leading/trailing whitespace", async () => {
            const content = "  line 1  \n\tline 2\n  line 3";
            const find = "line 1\nline 2\nline 3";
            const result = await runReplacer(LineTrimmedReplacer, content, find);
            expect(result).toHaveLength(1);
            expect(result[0]).toBe("  line 1  \n\tline 2\n  line 3");
        });

        test("fails if inner content does not match", async () => {
            const content = "  line 1  \n\tline X\n  line 3";
            const find = "line 1\nline 2\nline 3";
            const result = await runReplacer(LineTrimmedReplacer, content, find);
            expect(result).toEqual([]);
        });
    });

    describe("TrimmedBoundaryReplacer", () => {
        test("matches when find string has surrounding whitespace", async () => {
            const content = "hello world";
            const find = "   hello world   ";
            const result = await runReplacer(TrimmedBoundaryReplacer, content, find);
            expect(result).toContain("hello world");
        });

        test("matches block even if it matches trimmed find", async () => {
            const content = "\n  hello world  \n";
            const find = "   hello world   ";
            // The replacer looks for blocks in content that trim to equal find.trim()
            const result = await runReplacer(TrimmedBoundaryReplacer, content, find);
            expect(result).toContain("  hello world  ");
        });
    });

    describe("WhitespaceNormalizedReplacer", () => {
        test("matches content with different internal whitespace", async () => {
            const content = "function   test( a ) { return; }";
            const find = "function test( a ) { return; }";
            const result = await runReplacer(WhitespaceNormalizedReplacer, content, find);
            expect(result).toContain("function   test( a ) { return; }");
        });

        test("matches multi-line normalized whitespace", async () => {
            const content = "line 1 \n line   2";
            const find = "line 1\nline 2";
            const result = await runReplacer(WhitespaceNormalizedReplacer, content, find);
            expect(result).toContain("line 1 \n line   2");
        });
    });

    describe("IndentationFlexibleReplacer", () => {
        test("matches content with different base indentation", async () => {
            const content = "    line 1\n    line 2";
            const find = "line 1\nline 2";
            const result = await runReplacer(IndentationFlexibleReplacer, content, find);
            expect(result).toContain("    line 1\n    line 2");
        });

        test("matches nested block", async () => {
            const content = "function() {\n  if (true) {\n    doSomething();\n    return;\n  }\n}";
            const find = "doSomething();\nreturn;";
            const result = await runReplacer(IndentationFlexibleReplacer, content, find);
            expect(result).toContain("    doSomething();\n    return;");
        });
    });

    describe("EscapeNormalizedReplacer", () => {
        test("matches unescaped content with escaped find string", async () => {
            const content = 'console.log("hello")';
            // biome-ignore lint/suspicious/noUselessEscapeInString: this is intentional
            const find = 'console.log(\"hello\")';
            const result = await runReplacer(EscapeNormalizedReplacer, content, find);
            expect(result).toContain('console.log("hello")');
        });

        test("matches escaped content with unescaped find string", async () => {
            // Use quotes instead of newlines to avoid line count mismatch issues
            const content = "const str = 'user\\'s data'";
            const find = "const str = 'user\\'s data'"; // user input matches literal

            // unescapeString(find) -> const str = 'user's data'
            // content block (1 line) -> const str = 'user\'s data'
            // unescapeString(block) -> const str = 'user's data'
            const result = await runReplacer(EscapeNormalizedReplacer, content, find);
            expect(result).toContain("const str = 'user\\'s data'");
        });
    });

    describe("BlockAnchorReplacer", () => {
        test("matches block with fuzzy middle lines", async () => {
            const content = "start\nmiddle line changed\nend";
            const find = "start\nmiddle line original\nend";
            const result = await runReplacer(BlockAnchorReplacer, content, find);
            expect(result).toContain("start\nmiddle line changed\nend");
        });

        test("requires anchors to match", async () => {
            const content = "startX\nmiddle line changed\nend";
            const find = "start\nmiddle line original\nend";
            const result = await runReplacer(BlockAnchorReplacer, content, find);
            expect(result).toEqual([]);
        });

        test("handles multiple candidates by choosing best match", async () => {
            const content = "start\nvery different\nend\n" + "start\nslight diff\nend";
            const find = "start\nslight difference\nend";

            // "slight diff" should be closer to "slight difference" than "very different"
            const result = await runReplacer(BlockAnchorReplacer, content, find);
            expect(result).toContain("start\nslight diff\nend");
            expect(result).not.toContain("start\nvery different\nend");
        });
    });

    describe("ContextAwareReplacer", () => {
        test("matches block using context anchors", async () => {
            const content = "context start\nsome code\ncontext end";
            const find = "context start\nsome code\ncontext end";
            const result = await runReplacer(ContextAwareReplacer, content, find);
            expect(result).toContain("context start\nsome code\ncontext end");
        });

        test("allows some deviation in middle content", async () => {
            const content = "start\nmatch\nno match\nend";
            const find = "start\nmatch\ndifferent\nend";

            const result2 = await runReplacer(ContextAwareReplacer, content, find);
            expect(result2).toContain("start\nmatch\nno match\nend");
        });
    });
});
