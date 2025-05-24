# CodeLoops: Installation Guide

## Prerequisites

Before starting, ensure you have the following dependencies

- **Node.js**: Version 18 or higher
  - Download from [nodejs.org](https://nodejs.org) or use a version manager like `nvm`
  - Verify with: `node --version`
- **Python**: Version 3.11 or higher
  - Download from [python.org](https://www.python.org)
  - Verify with: `python3 --version`
- **uv**: A modern Python package manager
  - Install per [uv documentation](https://docs.astral.sh/uv/getting-started/installation)
  - Verify with: `uv --version`
- **API Keys**: Required for your chosen LLM provider (e.g., Anthropic, OpenAI)
  - Obtain keys from your provider’s dashboard

## Installation Steps

### Step 1: Clone the Repository

1. Open a terminal and clone the CodeLoops repository:
   ```bash
   git clone https://github.com/SilvaByte/codeloops.git
   ```
2. Navigate to the project directory:
   ```bash
   cd codeloops
   ```
3. Verify the repository structure:
   ```bash
   ls
   ```
   You should see directories like `src`, `agents`, and files like `package.json`.

### Step 2: Understand the Project Structure

The CodeLoops project has two main components:

- **MCP Server** (Node.js): Manages the CodeLoops system and Knowledge Graph.
- **Agent Components** (Python): Includes Critic and Summarization agents for evaluating and condensing information.

Key directories:

```
codeloops/
├── src/                # MCP server and core components
│   ├── engine/         # Actor, Critic, and RevisionCounter
│   ├── agents/         # Agent integration code
│   └── ...             # Other core components
├── agents/             # Python agent implementations
│   ├── critic/         # Quality evaluation agent
│   └── summarize/      # Branch summarization agent
├── package.json        # Node.js dependencies
└── README.md           # Project documentation
```

### Step 3: Install Node.js Dependencies

1. From the project root (`codeloops/`), install Node.js dependencies:
   ```bash
   npm install
   ```
2. Verify installation:
   ```bash
   npm list
   ```
   Ensure no errors appear, and dependencies like `typescript` and `tsx` are listed.

### Step 4: Set Up Python Agents

The Critic and Summarization agents require separate Python environments managed by `uv`.

#### 4.1 Critic Agent Setup

1. Navigate to the Critic agent directory:
   ```bash
   cd agents/critic
   ```
2. Install Python dependencies using `uv`:
   ```bash
   uv sync
   ```
   This creates a virtual environment and installs dependencies listed in `pyproject.toml`.
3. Copy configuration templates:
   ```bash
   cp fastagent.config.template.yaml fastagent.config.yaml
   cp fastagent.secrets.template.yaml fastagent.secrets.yaml
   ```
4. Edit `fastagent.secrets.yaml` to include your LLM API key:

```yaml
anthropic:
  api_key: your-anthropic-api-key
# Example for OpenAI
openai:
  api_key: your-openai-api-key
# Example for Gemini
google:
  api_key: your-gemini-api-key
```

Replace `your-anthropic-api-key` or `your-openai-api-key` with your actual keys. 5. Verify configuration:

```bash
uv run fast-agent check
```

This checks if the configuration and API keys are valid.

For more info on LLM providers and models, see the [fast-agent docs](https://fast-agent.ai/models/llm_providers/)

#### 4.2 Summarization Agent Setup

1. Navigate to the Summarization agent directory:
   ```bash
   cd ../summarize
   ```
2. Install Python dependencies:
   ```bash
   uv sync
   ```
3. Copy configuration templates:
   ```bash
   cp fastagent.config.template.yaml fastagent.config.yaml
   cp fastagent.secrets.template.yaml fastagent.secrets.yaml
   ```
4. Edit `fastagent.secrets.yaml` with the same API keys used for the Critic agent.
5. Verify configuration:
   ```bash
   uv run fast-agent check
   ```

> **Important**: Progress logs are disabled by default. If you installed
> CodeLoops before this change, edit each `fastagent.config.yaml` and
> ensure it contains:
>
> ```yaml
> logger:
>   level: info
>   progress_display: false
> ```
>
> Set the value to `true` if you want a progress bar. You can copy the
> latest template over the file if needed.

For more info on LLM providers and models, see the [fast-agent docs](https://fast-agent.ai/models/llm_providers/)

#### 4.3 Understanding `uv sync`

The `uv sync` command:

- Reads `pyproject.toml` for dependency specifications
- Creates or updates a virtual environment in `.venv`
- Installs required packages
- Generates a `uv.lock` file for reproducible builds

If `uv sync` fails, ensure `uv` is installed and Python 3.11+ is available.

### Gemini Support

CodeLoops works with Google's Gemini models through fast-agent.

1. In each agent directory, add a `google:` section with your API key in
   `fastagent.secrets.yaml`:

   ```yaml
   google:
     api_key: your-gemini-api-key
   ```

2. To use a Gemini model by default, set `default_model` in
   `fastagent.config.yaml`:

   ```yaml
   default_model: google.gemini-pro
   ```

The template files already include commented Gemini lines that you can
uncomment when needed.

#### Gemini Input Caching

You can store Gemini prompt context using the caching API. Set the
`GEMINI_CACHE_TTL` environment variable (in seconds) before starting the server
to control how long cached inputs persist. See
[genai-node-reference.md](../genai-node-reference.md) for details on the Gemini
caching API.

Set `GENAI_THINKING_BUDGET` to control the token budget spent on the model's
thinking phase. Use `0` to disable thinking entirely. The server forwards this
value to Gemini using `thinkingConfig` during generation.

Set `SUMMARIZATION_THRESHOLD` to control how many new nodes must accumulate
before the summarizer runs. The default is `20` if unset or invalid.

### Step 5: Test the MCP Server

1. Start the MCP server:
   ```bash
   npx -y tsx src
   ```
2. The server should start without any errors
   ```
   CodeLoops MCP server running on stdio
   ```

### Step 6: Test the Agent Config

- From the `agents/critic` directory, verify the Critic agent’s configuration and connectivity:
  ```bash
  fast-agent check
  ```
  This ensures the agent’s configuration, API keys, etc are valid
- Navigate to the Summarization agent directory and repeat:
  ```bash
  cd ../summarize
  fast-agent check
  ```
  Expect confirmation that both agents are correctly set up and can communicate with the MCP server.
