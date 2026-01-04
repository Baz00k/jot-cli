# Jot CLI - AI Research Assistant

A CLI-based AI agent designed to assist in writing research papers. It gathers context from your project, drafts content, reviews it for academic rigor, and refines it.

## Installation

### For End Users

In the future the tool should be available to install via package managers like npm or brew.
Currently, the only installation method is to download the appropriate binary for your platform
from the releases page and add it to your PATH.

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

## Usage

```bash
jot write "Draft a conclusion for the paper summarizing the key findings on LLM reasoning."
```

## Google Antigravity Provider

Jot CLI supports the internal Google Antigravity API as a provider.
Antigravity allows you to use SOTA Gemini and Claude models for free.

### Authentication

To use this provider, you need to authenticate via OAuth2:

```bash
jot auth
```

This command will open a browser window for you to sign in with your Google account.

### Configuration

You can configure Jot CLI to use Antigravity models for drafting and reviewing:

```bash
# Set the writer model
jot config set-writer google/antigravity-gemini-3-flash

# Set the reviewer model
jot config set-reviewer google/antigravity-claude-sonnet-4-5
```

### Model IDs

When using the Antigravity provider, the model ID should include the `antigravity-` prefix. You can optionally include the `google/` prefix as well. The CLI will automatically strip these prefixes when making API requests.

- **Example**: `antigravity-gemini-3-flash` or `google/antigravity-gemini-3-flash` both will use `gemini-3-flash` using Antigravity API.

### Available Antigravity Models

| Model                                           | Description                       |
| ----------------------------------------------- | --------------------------------- |
| `google/antigravity-gemini-3-flash`             | Gemini 3 Flash (minimal thinking) |
| `google/antigravity-gemini-3-pro-low`           | Gemini 3 Pro with low thinking    |
| `google/antigravity-gemini-3-pro-high`          | Gemini 3 Pro with high thinking   |
| `google/antigravity-claude-sonnet-4-5`          | Claude Sonnet 4.5 (no thinking)   |
| `google/antigravity-claude-sonnet-4-5-thinking` | Sonnet with thinking              |
| `google/antigravity-claude-opus-4-5-thinking`   | Opus with thinking                |

Antigravity provides limited quota for each model.
If the quota is exceeded, the model will return an error.
You can always use other google account or wait until the quota is reset.

## Features

- **Context Awareness**: Reads your project files to understand style and structure.
- **Draft-Review-Refine Loop**: Ensures high-quality academic output.
- **Cross-Platform Configuration**: Works seamlessly on Windows, macOS, and Linux.

## Recommended Models

This is a list of models that have been tested and found to work well with Jot CLI:

- google/gemini-3-pro-preview / google/antigravity-gemini-3-pro-high
- anthropic/claude-opus-4.5 / google/antigravity-claude-opus-4.5-thinking
- google/gemini-3-flash-preview / google/antigravity-gemini-3-flash
- openai/gpt-5.2-pro
- x-ai/grok-4.1-fast
- moonshotai/kimi-k2-thinking
- z-ai/glm-4.7
