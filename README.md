# Jot CLI - AI Research Assistant

A CLI-based AI agent designed to assist in writing research papers. It gathers context from your project, drafts content, reviews it for academic rigor, and refines it.

## Setup

1.  **Install dependencies**:

    ```bash
    bun install
    ```

2.  **Configure Environment**:
    Copy `.env.example` to `.env` and add your OpenRouter API key.
    ```bash
    cp .env.example .env
    ```
    Edit `.env`:
    ```env
    OPENROUTER_API_KEY=sk-or-your-key
    ```

## Usage

Run the CLI using Bun:

```bash
bun run src/index.ts write
```

Or pass a prompt directly:

```bash
bun run src/index.ts write "Draft a conclusion for the paper summarizing the key findings on LLM reasoning."
```

### Options

- `-w, --writer <model>`: Specify the drafting model (default: `moonshotai/kimi-k2-thinking`).
- `-r, --reviewer <model>`: Specify the reviewer model (default: `google/gemini-3-pro-preview`).

## Features

- **Context Awareness**: Reads your project files to understand style and structure.
- **Draft-Review-Refine Loop**: Ensures high-quality academic output.
- **Safe File Operations**: Checks specifically for project boundaries before reading/writing.
