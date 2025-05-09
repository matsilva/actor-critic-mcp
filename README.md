# CodeLoops: Quickstart Guide

<div align="center">
  <img src="codeloops_banner.svg" alt="CodeLoops Banner" width="600"/>
  <p><strong>Enhance your AI coding agents with persistent memory and improved decision-making</strong></p>
</div>

## Get Started in Seconds

CodeLoops enhances AI coding agents with persistent memory and improved decision-making capabilities. It solves two critical problems:

- **Memory Loss**: AI agents forget what they wrote minutes ago
- **Credit Assignment**: AI agents can't trace which early design choices led to later problems

> **Experimental Disclaimer**: This project is in active development. Back up your data and monitor API costs.

### Quick Setup

```bash
# Clone the repository
git clone https://github.com/matsilva/codeloops.git
cd codeloops

# Run the automated setup script
npm run setup
```

That's it! The setup script will:

- Check for prerequisites (Node.js, Python, uv)
- Install all dependencies
- Configure the Python environments
- Guide you through API key setup

### Start the Server

```bash
npm run start
```

This will start the CodeLoops server directly without requiring any additional commands.

## 🔌 Using with AI Coding Agents

Once the server is running, you can use CodeLoops with your AI coding agent:

1. **Configure your agent** to use the MCP server
2. **Use prompts** like: "Use the CodeLoops tool to plan and implement..."

### Example Prompt for Claude

```
I want to use the CodeLoops tool to plan and implement a feature that...
```

### Example Prompt for GPT

```
Use the CodeLoops tool to help me design a system that...
```

## 🛠️ Available Tools

CodeLoops provides these tools to your AI agent:

- `actor_think`: Add a thought to the knowledge graph (primary tool)
- `list_branches`: Show all branches in the knowledge graph
- `resume`: Fetch recent context for a branch
- `export_plan`: Export the current graph
- `summarize_branch`: Generate a summary for a branch
- `list_projects`: List all available projects
- `switch_project`: Switch to a different project
- `create_project`: Create a new project

## 📋 Basic Workflow

1. **Start a project**: Create or switch to a project
2. **Plan**: Use `actor_think` to add planning nodes
3. **Implement**: Continue using `actor_think` for implementation steps
4. **Review**: The system automatically reviews your progress
5. **Summarize**: Generate summaries of your work

## 🔍 Troubleshooting

### Common Issues

| Issue                                           | Solution                                            |
| ----------------------------------------------- | --------------------------------------------------- |
| "Failed to parse JSON from uv mcp-server-fetch" | Check API keys in `agents/*/fastagent.secrets.yaml` |
| "No module named 'fast-agent-mcp'"              | Run `cd agents/critic && uv sync`                   |
| MCP server not responding                       | Ensure server is running with `npm run start`       |

### Need More Help?

- Check the [GitHub repository](https://github.com/matsilva/codeloops) for issues
- File a new issue with details about your problem
- For advanced usage, see the [detailed documentation](docs/OVERVIEW.md)

## 🔬 Advanced Usage

For more detailed information about CodeLoops, including:

- Project structure
- Configuration options
- Advanced workflows
- Customization

See the [Advanced Documentation](docs/OVERVIEW.md)

## 📊 System Architecture

CodeLoops uses an Actor-Critic architecture with a Knowledge Graph:

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  AI Agent   │────▶│    Actor    │────▶│ Knowledge   │
│             │◀────│             │◀────│ Graph       │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   ▲
                           ▼                   │
                    ┌─────────────┐     ┌─────────────┐
                    │   Critic    │────▶│ Summarizer  │
                    │             │     │             │
                    └─────────────┘     └─────────────┘
```

The system maintains context across long coding sessions and improves decision quality over time.
