# Jot CLI - AI Research Assistant

A CLI-based AI agent designed to assist in writing research papers. It gathers context from your project, drafts content, reviews it for academic rigor, and refines it.

## Installation

### For Development

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/Baz00k/jot-cli.git
    cd jot-cli
    ```

2.  **Install dependencies**:

    ```bash
    bun install
    ```

3.  **Configure OpenRouter API Key**:

    Set your OpenRouter API key using the config command:

    ```bash
    bun run src/index.ts config set-key YOUR_API_KEY
    ```

    Get your API key from https://openrouter.ai/

### For End Users

In the future the tool should be available to install via package managers like npm or brew.
Currently, the only installation method is to download the appropriate binary for your platform
from the releases page and add it to your PATH.

## Usage

```bash
jot write "Draft a conclusion for the paper summarizing the key findings on LLM reasoning."
```

## Features

- **Context Awareness**: Reads your project files to understand style and structure.
- **Draft-Review-Refine Loop**: Ensures high-quality academic output.
- **Cross-Platform Configuration**: Works seamlessly on Windows, macOS, and Linux.

## Recommended Models

This is a list of models that have been tested and found to work well with Jot CLI:

- google/gemini-3-pro-preview
- anthropic/claude-opus-4.5
- google/gemini-3-flash-preview
- openai/gpt-5.2-pro
- x-ai/grok-4.1-fast
- moonshotai/kimi-k2-thinking
- z-ai/glm-4.7
