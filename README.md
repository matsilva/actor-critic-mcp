![CodeLoops](codeloops_banner.svg)

# CodeLoops: Enabling Coding Agent Autonomy

CodeLoops is currently an experimental system, taking a different approach to help bring us closer to the holy grail of software development: fully autonomous coding agents.

Inspired by the actor-critic model from Max Bennett’s _A Brief History of Intelligence_, CodeLoops aims to tackle the challenge of AI Agent “code slop”: messy, error-prone output that forgets APIs and drifts from project goals. By integrating with your existing agent as an MCP server, it delivers iterative feedback and persistent context, empowering your agent to work independently in auto mode while staying aligned with your vision.

> **Note**: CodeLoops is in early development. Expect active updates. Back up your data and monitor API costs for premium models.

Learn more by [reading the announcement](https://bytes.silvabyte.com/improving-coding-agents-an-early-look-at-codeloops-for-building-more-reliable-software/).

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
- Prompting for API key setup for models like Anthropic or OpenAI.

> **Tip**: I’ve had great results with Anthropic’s Haiku 3.5, costing about $0.60 weekly. It’s a solid starting point.

If this script fails, see [install guide](./docs/INSTALL_GUIDE.md) for installing the project dependencies

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

## Available Tools

CodeLoops provides tools to enable autonomous agent operation:

- `actor_think`: Drives interaction with the actor-critic system, automatically triggering critic reviews when needed.
- `list_branches`: Lists all knowledge graph branches for context.
- `resume`: Retrieves recent branch context for continuity.
- `export_plan`: Exports the current graph for agent review.
- `summarize_branch`: Generates a summary of branch progress.
- `list_projects`: Displays all projects for navigation.
- `switch_project`: Switches to another project seamlessly.
- `create_project`: Initializes a new project.

## Basic Workflow

1. **Create a Project**: Start with `create_project` or switch using `switch_project`.
2. **Plan Autonomously**: Add planning nodes with `actor_think`, guided by the critic.
3. **Implement Independently**: Use `actor_think` for coding steps, refined in real time.
4. **Review Progress**: The critic autonomously evaluates and corrects.
5. **Summarize Work**: Use `summarize_branch` to generate clear summaries.
6. **Provide Feedback**: Offer human-in-the-loop input as needed to refine outcomes.

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

## Contribute

CodeLoops is open source, and your contributions are crucial to achieving coding agent autonomy. Whether you’re fixing bugs, adding features, or sharing feedback, you’ll help shape a tool that empowers developers and non-developers to build with confidence. Join the journey:
