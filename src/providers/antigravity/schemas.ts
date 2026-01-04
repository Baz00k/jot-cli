import { Schema } from "effect";

export const TokenResponseSchema = Schema.Struct({
    access_token: Schema.String,
    expires_in: Schema.Number,
    refresh_token: Schema.optional(Schema.String),
});

export const PartSchema = Schema.Struct({
    text: Schema.optional(Schema.String),
    functionCall: Schema.optional(
        Schema.Struct({
            name: Schema.String,
            args: Schema.Record({ key: Schema.String, value: Schema.Any }),
        }),
    ),
    thoughtSignature: Schema.optional(Schema.String),
});

export const ContentSchema = Schema.Struct({
    parts: Schema.optional(Schema.Array(PartSchema)),
});

export const CandidateSchema = Schema.Struct({
    content: Schema.optional(ContentSchema),
    finishReason: Schema.optional(Schema.String),
});

export const UsageMetadataSchema = Schema.Struct({
    promptTokenCount: Schema.optional(Schema.Number),
    candidatesTokenCount: Schema.optional(Schema.Number),
});

export const GenerateResponseSchema = Schema.Struct({
    candidates: Schema.optional(Schema.Array(CandidateSchema)),
    usageMetadata: Schema.optional(UsageMetadataSchema),
    response: Schema.optional(
        Schema.Struct({
            candidates: Schema.optional(Schema.Array(CandidateSchema)),
            usageMetadata: Schema.optional(UsageMetadataSchema),
        }),
    ),
});
