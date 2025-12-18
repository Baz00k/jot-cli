import type { Stream } from "effect";
import { BlockAnchorReplacer } from "./blockAnchor";
import { ContextAwareReplacer } from "./contextAware";
import { EscapeNormalizedReplacer } from "./escapeNormalized";
import { IndentationFlexibleReplacer } from "./indentationFlexible";
import { LineTrimmedReplacer } from "./lineTrimmed";
import { MultiOccurrenceReplacer } from "./multiOccurrence";
import { SimpleReplacer } from "./simple";
import { TrimmedBoundaryReplacer } from "./trimmedBoundary";
import { WhitespaceNormalizedReplacer } from "./whitespaceNormalized";

export type Replacer = (content: string, find: string) => Stream.Stream<string>;

export {
    BlockAnchorReplacer,
    ContextAwareReplacer,
    EscapeNormalizedReplacer,
    IndentationFlexibleReplacer,
    LineTrimmedReplacer,
    MultiOccurrenceReplacer,
    SimpleReplacer,
    TrimmedBoundaryReplacer,
    WhitespaceNormalizedReplacer,
};
