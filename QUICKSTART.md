# Actor-Critic MCP: Quickstart Guide

## Introduction

Actor-Critic MCP is an experimental system that enhances AI coding agents with persistent memory and improved decision-making capabilities. It addresses two critical problems in AI coding assistants:

1. **Memory Loss**: AI agents forget what they wrote minutes ago, leading to duplicated components and inconsistent designs
2. **Credit Assignment**: AI agents can't trace which early design choices led to later problems

The system uses an Actor-Critic architecture with a Knowledge Graph to maintain context across long coding sessions and improve decision quality over time.

> **⚠️ Experimental Disclaimer**: This project is in active development. Back up your data, monitor API costs, and expect occasional issues.

## Prerequisites

Before getting started, ensure you have the following installed:

- **Node.js** (v18+)
- **Python** (v3.11+)
- **uv** - A modern Python package manager
  See [uv installation instructions](https://docs.astral.sh/uv/getting-started/installation)
- **API Keys** for your preferred LLM provider (Anthropic, OpenAI, etc.)

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/matsilva/actor-critic-mcp.git
cd actor-critic-mcp
```

### 2. Project Structure Overview

The project consists of two main components:

- **MCP Server** (Node.js): Manages the Actor-Critic loop and Knowledge Graph
- **Agent Components** (Python): Critic and Summarization agents that evaluate and condense information

Key directories:

```
src/                # MCP server and core components
├── actor-critic/   # Actor, Critic, and RevisionCounter implementations
├── agents/         # Agent integration code
└── ...             # Other core components

agents/             # Python agent implementations
├── critic/         # Quality evaluation agent
└── summarize/      # Branch summarization agent
```

### 3. Install Node.js Dependencies

```bash
npm install
```

## Agent Setup

### 1. Critic Agent Configuration

```bash
# Navigate to the critic agent directory
cd agents/critic

# Install Python dependencies using uv
uv sync

# Configure the agent
cp fastagent.config.template.yaml fastagent.config.yaml
cp fastagent.secrets.template.yaml fastagent.secrets.yaml
```

Edit `fastagent.secrets.yaml` to add your API keys:

```yaml
# Example for Anthropic
anthropic:
  api_key: your-api-key-here
```

### 2. Summarize Agent Configuration

```bash
# Navigate to the summarize agent directory
cd ../summarize

# Install Python dependencies using uv
uv sync

# Configure the agent
cp fastagent.config.template.yaml fastagent.config.yaml
cp fastagent.secrets.template.yaml fastagent.secrets.yaml
```

Edit `fastagent.secrets.yaml` to add your API keys (same as for the critic agent).

### 3. Understanding uv sync

The `uv sync` command:

- Reads dependencies from `pyproject.toml`
- Creates/updates a virtual environment
- Installs all required packages
- Generates a lockfile for reproducible environments

## MCP Integration

### 1. Register the Actor-Critic MCP Server

```bash
# From the project root directory
npx -y tsx path/to/actor-critic-mcp/src
```

This starts the MCP server, which will listen for commands from AI agents.

### 2. Testing the Connection

You can test that the MCP server is running correctly by using it with an AI agent. The exact integration depends on your AI agent or tool, but typically involves:

1. Configuring the agent to use the MCP server
2. Sending a test prompt that uses the Actor-Critic tools

## Usage Guide

### Basic Usage

When interacting with an AI agent that has access to the Actor-Critic MCP, you can use prompts like:

```
Use the actor critic tool to plan and implement a feature that...
```

The Actor-Critic system provides several tools that the AI agent can use:

- `actor_think`: Creates a new thought node in the knowledge graph (primary tool)
- `critic_review`: Manually evaluates an actor node (rarely needed)
- `list_branches`: Shows all branches in the knowledge graph
- `resume`: Fetches recent context for a branch
- `export_plan`: Exports the current graph, optionally filtered by tag
- `summarize_branch`: Generates a summary for a specific branch
- `list_projects`: Lists all available knowledge graph projects
- `switch_project`: Switches to a different knowledge graph project
- `create_project`: Creates a new knowledge graph project

### Actor-Critic Workflow

The actor-critic system follows this workflow:

1. The agent calls `actor_think` to add a new thought node to the knowledge graph
2. The system automatically triggers a critic review when:
   - A certain number of steps have been taken (configured by CRITIC_EVERY_N_STEPS)
   - The actor indicates the thought doesn't need more work (needsMore=false)
3. The critic evaluates the node and provides a verdict:
   - `approved`: The node meets all requirements
   - `needs_revision`: The node needs specific improvements
   - `reject`: The node is fundamentally flawed or has reached max revision attempts

**Important Note**: In most cases, you don't need to call `critic_review` directly as it's automatically triggered by `actor_think` when appropriate. The `critic_review` tool is primarily useful for manual intervention, forcing a review of a specific previous node, or debugging purposes.

### Project Management

The Actor-Critic system supports working with multiple knowledge graph projects, each with its own separate context:

1. **Listing Projects**:

   ```
   Use the list_projects tool to see all available projects
   ```

2. **Switching Projects**:

   ```
   Use the switch_project tool to switch to the "my-feature" project
   ```

3. **Creating a New Project**:
   ```
   Use the create_project tool to create a new project called "new-feature"
   ```

Project names must be alphanumeric with optional dashes and underscores, and have a maximum length of 50 characters. Each project maintains its own separate knowledge graph, allowing you to work on different codebases or features without mixing contexts.

### Example Workflow

1. **Planning Phase**:

   ```
   Use actor critic to plan a new feature for...
   ```

2. **Implementation Phase**:

   ```
   Continue implementing the feature using actor critic...
   ```

3. **Summary Phase**:
   ```
   Use summarize_branch tools and create a summary for the work done so far.
   ```

## Troubleshooting

### Common Issues

#### Agent Configuration Problems

**Issue**: "Failed to parse JSON from uv mcp-server-fetch"
**Solution**: Check that the agent configuration files are correctly set up and API keys are valid. You can run `fast-agent check` to verify from the agent directory.

#### Python Environment Issues

**Issue**: "No module named 'fast-agent-mcp'"
**Solution**: Run `uv sync` in the agent directory to install dependencies.

#### MCP Connection Problems

**Issue**: MCP server not responding
**Solution**: Ensure the MCP server is running with `npx -y tsx path/to/actor-critic-mcp/src`.

### Getting Help

If you encounter issues not covered here:

1. Check the [GitHub repository](https://github.com/matsilva/actor-critic-mcp) for open issues
2. File a new issue with details about your problem
3. Review the source code for more detailed information about components

## Next Steps

After getting the basic system working, you might want to:

- Explore the Knowledge Graph structure
- Customize the Critic agent's evaluation criteria
- Integrate with additional AI tools
- Contribute improvements back to the project

Remember that this is an experimental project, and your feedback and contributions are welcome!
