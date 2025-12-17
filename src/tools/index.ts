import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";
import { searchFilesTool } from "./search-files";
import { writeFileTool } from "./write-file";

export { listFilesTool, readFileTool, searchFilesTool, writeFileTool };

export const tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    search_files: searchFilesTool,
};

export const explore_tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    search_files: searchFilesTool,
};

export const edit_tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    search_files: searchFilesTool,
};
