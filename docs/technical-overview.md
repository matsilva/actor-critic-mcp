# CodeLoops Technical Overview

This document provides a detailed technical overview of the CodeLoops application, focusing specifically on its knowledge graph and project management architecture. This overview is designed to help you understand the system end-to-end and plan enhancements effectively.

## Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Project Management System](#project-management-system)
3. [Knowledge Graph Architecture](#knowledge-graph-architecture)
4. [Actor-Critic Engine](#actor-critic-engine)
5. [Data Persistence Model](#data-persistence-model)
6. [Component Interactions](#component-interactions)
7. [Critical Paths and Potential Enhancement Areas](#critical-paths-and-potential-enhancement-areas)

## System Architecture Overview

CodeLoops implements an MCP (Model Context Protocol) server that provides a structured interface for AI agents to interact with a knowledge graph system. The core components are:

```
┌─────────────────────────────────┐
│       MCP Server Interface      │
└───────────────┬─────────────────┘
                │
┌───────────────▼─────────────────┐
│       Actor-Critic Engine       │
└───────────────┬─────────────────┘
                │
        ┌───────┴───────┐
        │               │
┌───────▼─────┐ ┌───────▼──────┐
│ Knowledge   │ │   Project    │
│    Graph    │ │   Manager    │
└───────┬─────┘ └───────┬──────┘
        │               │
        └───────┬───────┘
                │
┌───────────────▼─────────────────┐
│        File System Store        │
└─────────────────────────────────┘
```

The system uses a directed acyclic graph (DAG) structure to track the evolution of thoughts, critiques, and summaries in a workflow where an "Actor" agent proposes actions and a "Critic" agent reviews them.

## Project Management System

### Key Components

- **ProjectManager** (`src/engine/ProjectManager.ts`)
  - Manages project creation, switching, and validation
  - Maintains the current project context
  - Handles project name extraction from directory paths
  - Ensures project names follow security and format constraints

### Core Functionality

1. **Project Identification**
   - Projects are identified by a unique name derived from the directory path
   - Names are restricted to alphanumeric characters, dashes, and underscores
   - Maximum length of 50 characters

2. **Project State Management**
   - Each `ProjectManager` instance maintains its own state through `instanceCurrentProject`
   - This prevents global state issues across multiple editor instances

3. **Project File Operations**
   - Projects are stored as individual JSON files in a data directory
   - File operations are abstracted through the `FileOps` utility
   - File paths follow a consistent naming convention: `kg.${projectName}.json`

4. **Project Switching Logic**
   - `switchProjectIfNeeded` method enforces proper context isolation
   - Always forces a switch when a valid project context is provided
   - Creates new projects when non-existent projects are referenced

## Knowledge Graph Architecture

### Data Model

- **DagNode**
  - Represents a thought, critique, or summary in the graph
  - Contains metadata: ID, role, creation timestamp, tags, and artifacts
  - Establishes parent-child relationships through ID references

- **ArtifactRef**
  - Represents a file or resource affected by a thought
  - Contains metadata: path, name, hash, content type

- **BranchHead**
  - Represents the starting point of a thinking branch
  - Enables alternative solution exploration

### Core Components

- **KnowledgeGraphManager** (`src/engine/KnowledgeGraph.ts`)
  - Manages the DAG structure of thoughts and critiques
  - Handles persistence to and from JSON files
  - Switches between projects and maintains proper isolation
  - Implements graph traversal and querying functionality

### Graph Operations

1. **Entity Management**
   - `createEntity` adds nodes to the graph
   - Nodes can represent thoughts (actor), critiques (critic), or summaries

2. **Relation Management**
   - `createRelation` establishes edges between nodes
   - Relations have a source, destination, and type

3. **Query Operations**
   - `getNode` retrieves nodes by ID
   - `getChildren` finds child nodes by relation type
   - `getHeads` identifies root nodes in the graph
   - `depth` calculates the depth of a node in the graph

4. **Project Switching**
   - Critical path for data isolation
   - Ensures file path is updated after successful project switch
   - Flushes changes before switching
   - Clears in-memory data structures

## Actor-Critic Engine

### Components

- **ActorCriticEngine** (`src/engine/ActorCriticEngine.ts`)
  - Orchestrates the interaction between Actor and Critic agents
  - Handles automatic review triggers
  - Manages branch summarization

- **Actor** (`src/agents/Actor.ts`)
  - Creates thought nodes in the knowledge graph
  - Ensures correct project context is set
  - Determines when reviews are needed

- **Critic** (`src/agents/Critic.ts`)
  - Reviews actor thoughts
  - Provides verdicts: approved, needs revision, or reject
  - Records reasoning behind verdicts

- **SummarizationAgent** (`src/agents/Summarize.ts`)
  - Creates summary nodes for branches
  - Condenses large sequences of thoughts

### Workflow

1. Actor proposes a thought with associated context and artifacts
2. System potentially triggers a critic review
3. Critic evaluates the thought and provides feedback
4. Chain of thoughts forms a branch in the knowledge graph
5. Summarization occurs to compress longer branches

## Data Persistence Model

### File Structure

- Knowledge graph data is stored in JSON files
- Each project has its own file: `kg.${projectName}.json`
- Files contain serialized entities and relations arrays

### In-Memory Structure

- Entities are stored as a Record/Dictionary keyed by ID
- Relations are stored as an array of {from, to, type} objects
- Dirty flag tracks when changes need to be flushed to disk

### Persistence Operations

- `init()` loads data from the file
- `flush()` writes changes to the file when dirty
- Both operations handle file system errors gracefully

## Component Interactions

### MCP Server to ActorCriticEngine

1. MCP server receives tool calls from AI agents
2. Call is routed to appropriate engine method
3. Engine orchestrates the underlying operations

### ActorCriticEngine to KnowledgeGraphManager

1. Engine calls appropriate graph operations
2. Graph manager ensures correct project context
3. Data is persisted at key interaction points

### KnowledgeGraphManager to ProjectManager

1. Graph manager delegates project operations
2. Project manager maintains state and file paths
3. Project switch notifications flow back to graph manager

## Critical Paths and Potential Enhancement Areas

### Project Isolation

**Current Implementation:**
- Project switching relies on proper file path updates
- In-memory data is cleared after switching
- Each component maintains its own reference to the current project

**Enhancement Opportunities:**
- Add project ID to all nodes for additional validation
- Implement transaction-based operations for atomic changes
- Add verification steps before critical operations

### Data Consistency

**Current Implementation:**
- Relies on proper sequencing of operations
- Uses a dirty flag to track needed persistence
- Errors are logged but may not trigger recovery

**Enhancement Opportunities:**
- Implement versioning for conflict resolution
- Add data validation at load/save boundaries
- Implement more robust error recovery

### Performance Considerations

**Current Implementation:**
- All data for a project is loaded into memory
- Entire graph is serialized on each save
- No pagination for large graphs

**Enhancement Opportunities:**
- Implement lazy loading for large graphs
- Add differential updates to reduce write operations
- Introduce caching for frequently accessed paths

### User Experience

**Current Implementation:**
- Project creation is triggered by context references
- Switching occurs automatically based on directory context
- Errors are logged but may not be visible to users

**Enhancement Opportunities:**
- Add project metadata (description, creation date)
- Implement project templates and presets
- Enhance error reporting and recovery options

## Conclusion

The CodeLoops system implements a flexible knowledge graph architecture paired with a robust project management system. The actor-critic workflow enables iterative thought refinement while maintaining proper isolation between different project contexts. 

Key strengths include the ability to track artifacts affected by thoughts, maintain branches for alternative approaches, and summarize long sequences of thoughts. The project management system's extraction of project names from directory contexts enables seamless switching between projects.

Enhancement opportunities primarily lie in hardening the data consistency guarantees, improving performance for larger graphs, and extending the user experience around project management.
