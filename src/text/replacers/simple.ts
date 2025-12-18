import { Stream } from "effect";
import type { Replacer } from ".";

export const SimpleReplacer: Replacer = (_content, find) => Stream.make(find);
