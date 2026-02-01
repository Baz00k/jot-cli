# Jot CLI - AI Research Assistant

A CLI-based AI agent designed to assist in writing research papers. It gathers context from your project, drafts content, reviews it for academic rigor, and refines it.
It works similarly to Ralph Loop - keeps working until it reaches a satisfactory level of quality.

## Installation

### Quick Install (MacOS/Linux)

```bash
curl -fsSL https://github.com/Baz00k/jot-cli/releases/latest/download/install.sh | bash
```

### Windows (PowerShell)

```powershell
irm https://github.com/Baz00k/jot-cli/releases/latest/download/install.ps1 | iex
```

### Homebrew (MacOS/Linux)

```bash
brew install https://github.com/Baz00k/jot-cli/releases/latest/download/jot-cli.rb
```

### Scoop (Windows)

```powershell
scoop install https://github.com/Baz00k/jot-cli/releases/latest/download/jot.json
```

## Usage

```bash
jot write "Draft a conclusion for the paper summarizing the key findings on LLM reasoning."
```

## Interactive TUI Mode

Launch the interactive Terminal User Interface by running `jot` without any arguments:

```bash
jot
```

### Key Features

- **Interactive Task Input**: Easily draft and refine your prompts.
- **Visual Timeline**: Track agent actions, tool calls, and review steps in real-time.

## Google Antigravity Provider

Jot CLI supports the internal Google Antigravity API as a provider.
Antigravity allows you to use SOTA Gemini and Claude models for free.

### Authentication

To use this provider, you need to authenticate via OAuth2:

```bash
jot antigravity auth
```

This command will open a browser window for you to sign in with your Google account.

### Configuration

You can configure Jot CLI to use Antigravity models for drafting and reviewing:

```bash
# Set the writer model
jot config set-writer antigravity/gemini-3-flash

# Set the reviewer model
jot config set-reviewer antigravity/claude-sonnet-4-5
```

### Model IDs

When using the Antigravity provider, use the format `antigravity/<model-name>`. The provider prefix determines which API to use.

- **Example**: `antigravity/gemini-3-flash` will use the Antigravity API

### Available Antigravity Models

| Model                                    | Description                       |
| ---------------------------------------- | --------------------------------- |
| `antigravity/gemini-3-flash`             | Gemini 3 Flash (minimal thinking) |
| `antigravity/gemini-3-pro-low`           | Gemini 3 Pro with low thinking    |
| `antigravity/gemini-3-pro-high`          | Gemini 3 Pro with high thinking   |
| `antigravity/claude-sonnet-4-5`          | Claude Sonnet 4.5 (no thinking)   |
| `antigravity/claude-sonnet-4-5-thinking` | Sonnet with thinking              |
| `antigravity/claude-opus-4-5-thinking`   | Opus with thinking                |

Antigravity provides limited quota for each model.
If the quota is exceeded, the model will return an error.
You can always use other google account or wait until the quota is reset.

You can check the quota usage by running `jot antigravity quota`.

## Features

- **Context Awareness**: Reads your project files to understand style and structure.
- **Draft-Review-Refine Loop**: Ensures high-quality academic output.
- **Cross-Platform Configuration**: Works seamlessly on Windows, macOS, and Linux.

## Recommended Models

This is a list of models that have been tested and found to work well with Jot CLI:

- google/gemini-3-pro-preview / antigravity/gemini-3-pro-high
- anthropic/claude-opus-4.5 / antigravity/claude-opus-4.5-thinking
- google/gemini-3-flash-preview / antigravity/gemini-3-flash
- openai/gpt-5.2-pro
- x-ai/grok-4.1-fast
- moonshotai/kimi-k2-thinking
- z-ai/glm-4.7

## Development

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

4.  **Run the application**:

    ```bash
    bun run src/index.ts
    ```

    or with TUI:

    ```bash
    bun dev
    ```
