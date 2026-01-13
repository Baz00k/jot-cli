import type { ToolSet } from "ai";
import type { Runtime } from "effect";
import type { VFS } from "@/services/vfs";
import { editFileTool } from "./edit-file";
import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";
import {
    makeAddReviewCommentTool,
    makeApproveChangesTool,
    makeReadAllDiffsTool,
    makeReadFileDiffTool,
    makeRejectChangesTool,
} from "./review";
import { searchFilesTool } from "./search-files";
import { makeVfsEditFileTool, makeVfsReadFileTool, makeVfsWriteFileTool } from "./vfs";
import { webFetchTool } from "./web-fetch";
import { webSearchTool } from "./web-search";
import { writeFileTool } from "./write-file";

export { editFileTool, listFilesTool, readFileTool, searchFilesTool, webFetchTool, webSearchTool, writeFileTool };

export const makeWriterTools = (runtime: Runtime.Runtime<VFS>) =>
    ({
        list_files: listFilesTool,
        search_files: searchFilesTool,
        read_file: makeVfsReadFileTool(runtime),
        write_file: makeVfsWriteFileTool(runtime),
        edit_file: makeVfsEditFileTool(runtime),
        web_fetch: webFetchTool,
        web_search: webSearchTool,
    }) satisfies ToolSet;

export const makeReviewerTools = (runtime: Runtime.Runtime<VFS>) =>
    ({
        read_all_diffs: makeReadAllDiffsTool(runtime),
        read_file_diff: makeReadFileDiffTool(runtime),
        read_file: makeVfsReadFileTool(runtime),
        add_review_comment: makeAddReviewCommentTool(runtime),
        approve_changes: makeApproveChangesTool(runtime),
        reject_changes: makeRejectChangesTool(runtime),
    }) satisfies ToolSet;
