import type { ToolSet } from "ai";
import { editFileTool } from "./edit-file";
import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";
import { searchFilesTool } from "./search-files";
import { webFetchTool } from "./web-fetch";
import { webSearchTool } from "./web-search";
import { writeFileTool } from "./write-file";

export { editFileTool, listFilesTool, readFileTool, searchFilesTool, webFetchTool, webSearchTool, writeFileTool };

export const tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    search_files: searchFilesTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
    web_fetch: webFetchTool,
    web_search: webSearchTool,
} satisfies ToolSet;

export const explore_tools = {
    list_files: listFilesTool,
    search_files: searchFilesTool,
    read_file: readFileTool,
    web_fetch: webFetchTool,
    web_search: webSearchTool,
} satisfies ToolSet;

export const edit_tools = {
    list_files: listFilesTool,
    search_files: searchFilesTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
} satisfies ToolSet;

export type ExploreTools = typeof explore_tools;
export type EditTools = typeof edit_tools;
