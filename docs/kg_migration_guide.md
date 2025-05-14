# Knowledge Graph Migration Guide

This document provides guidance for migrating from the legacy per-project JSON files to the new centralized NDJSON persistence system.

## Overview

The knowledge graph persistence system has been completely redesigned as a breaking change:

- Eliminated `ProjectManager` and all related methods
- Centralized storage in a single `knowledge_graph.ndjson` file
- All operations now require explicit project context
- No backward compatibility is provided

## Migration Process

### Step 1: Run the Migration Script

The migration script converts all existing per-project JSON files to the new NDJSON format:

```bash
# Navigate to the project root
cd /path/to/codeloops

# Run the migration script
npm run migrate
# or directly:
ts-node scripts/migrate.ts
```

The script will:
1. Find all existing `kg.*.json` files
2. Extract the project name from each file name
3. Add a `project` field to each entity
4. Append all entities to the new `knowledge_graph.ndjson` file
5. Create backups of the original files with `.bak` extension

### Step 2: Update Client Code

All client code must be updated to work with the new API. Key changes include:

#### For Tools and API Consumers

1. Always provide `projectContext` in all operations
2. Use project-scoped methods instead of relying on current project state
3. Remove any references to `ProjectManager` or its methods

Example changes:

```typescript
// Old code
const node = kg.getNode(nodeId);

// New code
const node = kg.getNode(nodeId, projectContext);
```

```typescript
// Old code
kg.switchProject(projectName);
const branches = kg.listBranches();

// New code
const branches = kg.listBranches(projectName);
```

#### For Actor/Critic Implementations

1. Always include `projectContext` in actor think inputs
2. Pass `projectContext` to critic review methods
3. Ensure all entities have a `project` field derived from `projectContext`

Example:

```typescript
// Old code
async think(input: ActorThinkInput): Promise<DagNode> {
  // ...implementation
}

// New code
async think(input: ActorThinkInput & { projectContext: string }): Promise<DagNode> {
  if (!input.projectContext) {
    throw new Error('projectContext is required');
  }
  // ...implementation
}
```

### Step 3: Test the Migration

After migration and code updates:

1. Verify that all nodes are correctly imported with project fields
2. Test operations with explicit project context
3. Ensure all tools and APIs function correctly with the new system

## Troubleshooting

### Missing Project Context

If you encounter errors about missing project context:

```
Error: projectContext is required
```

Ensure that all operations provide the project context parameter.

### Data Inconsistency

If you notice missing nodes or relationships:

1. Check the migration logs for errors
2. Verify that the migration script completed successfully
3. Inspect the `knowledge_graph.ndjson` file for proper formatting

### Performance Issues

The new system uses in-memory caching for improved performance. If you encounter performance degradation:

1. Ensure the `projectStates` map is not growing too large
2. Consider implementing periodic state cleanup for unused projects

## No Legacy Support

This is a breaking change with no backward compatibility. All code must be updated to work with the new API. The legacy project management system has been completely removed.

## Additional Resources

- [Knowledge Graph Design Document](./kg_design_v2.md)
- [Migration Script](../scripts/migrate.ts)
