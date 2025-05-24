![CodeLoops](codeloops_banner.svg)

# CodeLoops: Enabling Coding Agent Autonomy

CodeLoops is currently an experimental system, taking a different approach to help bring us closer to the holy grail of software development: fully autonomous coding agents.

Inspired by the actor-critic model from Max Bennett’s _A Brief History of Intelligence_, CodeLoops aims to tackle the challenge of AI Agent “code slop”: messy, error-prone output that forgets APIs and drifts from project goals. By integrating with your existing agent as an MCP server, it delivers iterative feedback and persistent context, empowering your agent to work independently in auto mode while staying aligned with your vision.

> **Note**: CodeLoops is in early development. Expect active updates. Back up your data and monitor API costs for premium models.

Learn more by:

- [reading the announcement](https://bytes.silvabyte.com/improving-coding-agents-an-early-look-at-codeloops-for-building-more-reliable-software/).
- [checking out the overview](./docs/OVERVIEW.md).

## Why CodeLoops?

AI coding agents promise to revolutionize development but suck at autonomy in complex projects. They suffer from memory gaps, context lapses, and a lack of guidance, producing unreliable code that requires constant manual fixes. CodeLoops unlocks their potential by providing:

- **Iterative Feedback**: An actor-critic system refines your agent’s decisions in real time, guiding it toward precise, high-quality output.
- **Knowledge Graph**: Stores context and feedback, ensuring your agent remembers APIs and project goals across sessions.
- **Seamless Integration**: Enhances the tools you already use like Cursor or Windsurf, letting your agent work smarter without disrupting your workflow.

For developers building larger scale software or non-developers bringing ideas to life, CodeLoops could transform your agent into a reliable autonomous partner.

## Quick Setup

Get CodeLoops up and running in minutes:

```bash
# Clone the repository
git clone https://github.com/matsilva/codeloops.git
cd codeloops

# Run the setup script
npm run setup
```

The script automates:

- Verifying prerequisites (Node.js, Python, uv).
- Installing dependencies.
- Configuring Python environments.
- Prompting for API key setup for models like Anthropic, OpenAI, or Google Gemini.

> **Tip**: I’ve had great results with Anthropic’s Haiku 3.5, costing about $0.60 weekly. It’s a solid starting point.

If this script fails, see [install guide](./docs/INSTALL_GUIDE.md) for installing the project dependencies

### Gemini Support

CodeLoops also supports Google's Gemini models. Add a `google:` section with your API key in each `agents/*/fastagent.secrets.yaml` file:

```yaml
google:
  api_key: your-gemini-api-key
```

Set a Gemini model as the default by editing `fastagent.config.yaml`:

```yaml
default_model: google.gemini-pro
```

### Gemini Input Caching

CodeLoops can store Gemini prompt context using the caching API. Set the
`GEMINI_CACHE_TTL` environment variable (seconds) to control how long cached
inputs remain. See
[`genai-node-reference.md`](./genai-node-reference.md) for details on the
Gemini caching API.

### Gemini Thinking Budget

Set the `GENAI_THINKING_BUDGET` environment variable to define the thinking
budget (in tokens) for Google GenAI models. A value of `0` disables thinking.

### Log Level

Control log verbosity by setting the `LOG_LEVEL` environment variable or
passing a `level` option to `createLogger`/`getInstance` (e.g. `debug`,
`info`, `warn`). Defaults to `info` if unset.

> **Note**: Setting `LOG_LEVEL=debug` writes large log entries and can quickly
> fill disk space. Use `info` unless you need deep debugging.

### Configure Your Agent

Connect your agent to the CodeLoops server by adding the MCP server configuration. Most platforms follow a similar structure:

```json
"mcp": {
  "servers": {
    "codeloops": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "tsx", "/path/to/codeloops/src"]
    }
  }
}
```

Ensure the configuration executes `npx -y tsx /path/to/codeloops/src`. Refer to your platform’s documentation for specific instructions.

## Using CodeLoops

With the server connected, instruct your agent to use CodeLoops for autonomous planning and coding.

### Example Prompt

```
Use codeloops to plan and implement the following:
... (insert your product requirements here)
```

When calling `actor_think`, include metadata so future steps can follow the graph:

- **`parents`** – IDs of prior nodes this thought builds on.
- **`diff`** – optional git-style diff summarizing any code changes.
- **`tags`** – semantic labels used for search. Tags are defined in the
  [`Tag` enum](./src/engine/tags.ts):
  - `Tag.Requirement`
  - `Tag.Task`
  - `Tag.Design`
  - `Tag.Risk`
  - `Tag.TaskComplete`
  - `Tag.Summary`

## Available Tools

CodeLoops provides tools to enable autonomous agent operation:

- `actor_think`: Drives interaction with the actor-critic system, automatically triggering critic reviews when needed.
- `resume`: Retrieves recent branch context for continuity.
- `export`: Exports the current graph for agent review.
- `search_nodes`: Filter nodes by tags or a text query.
- `artifact_history`: Retrieve all nodes referencing a specific artifact path.
- `summarize`: Generates a summary of branch progress.
- `list_projects`: Displays all projects for navigation.
- `get_neighbors`: Retrieve a node along with its parents and children up to a specified depth.
- `list_open_tasks`: List actor nodes tagged `task` that aren't marked `task-complete`.

## Basic Workflow

1. **Plan**: Add planning nodes with `actor_think`, guided by the critic.
2. **Implement**: Use `actor_think` for coding steps, refined in real time.
3. **Review**: The critic autonomously evaluates and corrects.
4. **Summarize**: Use `summarize` to generate clear summaries.
5. **Provide Feedback**: Offer human-in-the-loop input as needed to refine outcomes. YMMV depenting on how smart the coding agent is.

CodeLoops leverages an actor-critic model with a knowledge graph, where the Critic can delegate to a chain of specialized agents for enhanced precision:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│    Actor    │────▶│ Knowledge   │
│             │◀────│             │◀────│ Graph       │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   ▲
                           ▼                   │
                    ┌─────────────┐            │
                    │   Critic    │────────────┼───┐
                    │             │            │   │
                    └─────────────┘            │   │
                           │                   │   │
                           ▼                   │   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │ Specialized │     │ Summarizer  │
                    │ Agents      │     │             │
                    │ (Duplicate  │     │             │
                    │ Code,       │     │             │
                    │ Interface,  │     │             │
                    │ Best        │     │             │
                    │ Practices,  │     │             │
                    │ etc.)       │     │             │
                    └─────────────┘     └─────────────┘
```

This architecture enables your agent to maintain context, refine decisions through specialized checks, and operate autonomously with greater reliability.

### Need Help?

- Check [GitHub issues](https://github.com/silvabyte/codeloops/issues).
- File a new issue with details.
- **Email Me**: [mat@silvabyte.com](mailto:mat@silvabyte.com).
- **X**: [Reach out on X](https://x.com/MatSilva).

### License & contributing

This project is entirely experimental. Use at your own risk. & do what you want with it.

MIT see [license](../LICENSE)
