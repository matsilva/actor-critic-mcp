# Knowledge Graph Redesign Implementation

This document provides an overview of the knowledge graph redesign implementation in CodeLoops, based on the technical design document.

## Overview

The knowledge graph persistence mechanism has been redesigned to:

1. Use a single NDJSON file (`knowledge_graph.ndjson`) instead of per-project JSON files
2. Eliminate the `ProjectManager` class by embedding project data directly in nodes
3. Derive project names automatically from the `projectContext` provided in `ActorThinkSchema`
4. Optimize performance with streaming operations and in-memory state management

## Key Changes

### 1. Data Storage

- **Before**: Multiple `kg.<projectName>.json` files, one per project
- **Now**: Single `knowledge_graph.ndjson` file with project field in each entity

### 2. Project Management

- **Before**: `ProjectManager` class handled project creation, switching, and validation
- **Now**: Project context is embedded in nodes, derived from `projectContext` path

### 3. API Changes

- `KnowledgeGraphManager` no longer requires `ProjectManager`
- `createEntity` now requires a `projectContext` parameter
- `createRelation` is deprecated; use node `parents`/`children` arrays instead
- New `appendEntity` method handles atomic appends to the NDJSON file

## Migration

A migration script is provided to convert existing per-project JSON files to the new unified NDJSON format:

```bash
# Run the migration script
ts-node scripts/migrate.ts
```

The script:
1. Reads all existing `kg.*.json` files in the data directory
2. Extracts the project name from each file name
3. Adds the project field to each entity
4. Writes all entities to the new `knowledge_graph.ndjson` file
5. Creates backups of the original files

## Implementation Details

### DagNode and ArtifactRef Interfaces

Both interfaces now include a `project` field derived from `projectContext`.

### KnowledgeGraphManager

- Uses streaming APIs for efficient log processing
- Maintains in-memory state via `projectStates` Map for fast querying
- Implements `getProjectNameFromContext` to extract project names from directory paths

### Tools in index.ts

- `list_projects`: Uses `KnowledgeGraphManager.listProjects()`
- `switch_project`: Calls `KnowledgeGraphManager.switchProject(projectName)`
- `create_project`: Implicit via `projectContext` in `actor_think`

## Testing

To verify the implementation:
1. Run the migration script
2. Start the CodeLoops server
3. Use the `list_projects` tool to confirm all projects are available
4. Use the `actor_think` tool with different `projectContext` values to test project switching

## Future Considerations

- Log rotation for large NDJSON files
- Concurrency support with file locking
- Query optimization with project/ID indexes
