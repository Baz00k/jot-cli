import { editFileTool } from "./edit-file";
import { listFilesTool } from "./list-files";
import { readFileTool } from "./read-file";
import { searchFilesTool } from "./search-files";
import { writeFileTool } from "./write-file";

export { editFileTool, listFilesTool, readFileTool, searchFilesTool, writeFileTool };

export const tools = {
    list_files: listFilesTool,
    read_file: readFileTool,
    search_files: searchFilesTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
};

export const explore_tools = {
    list_files: listFilesTool,
    search_files: searchFilesTool,
    read_file: readFileTool,
};

export const edit_tools = {
    list_files: listFilesTool,
    search_files: searchFilesTool,
    read_file: readFileTool,
    write_file: writeFileTool,
    edit_file: editFileTool,
};
