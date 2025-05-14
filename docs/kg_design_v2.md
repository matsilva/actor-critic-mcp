Given the directive to implement a breaking change without legacy support, the redesign of the knowledge graph persistence for CodeLoops will fully eliminate all remnants of the old project management system, including `switchProject`, `switchProjectIfNeeded`, `getCurrentProject`, `flush`, and any `ProjectManager`-related dependencies. The system will rely entirely on `projectContext` from `ActorThinkSchema` to derive `DagNode.project`, and all operations will be explicitly scoped by project. This approach ensures a clean, streamlined implementation aligned with the new design's goals.

Below is the revised technical design document, followed by the updated `KnowledgeGraph.ts` implementation, reflecting the complete removal of legacy components and a focus on the new NDJSON-based persistence model.

---

# Technical Design Document: Redesign of Knowledge Graph Persistence for CodeLoops (Breaking Change)

## Version History

| Version | Date       | Author     | Description                       |
| ------- | ---------- | ---------- | --------------------------------- |
| 1.0     | 2025-05-14 | Grok (xAI) | Initial draft for breaking change |

## 1. Introduction

### 1.1 Purpose

This document outlines the technical design for a breaking change to CodeLoops’ knowledge graph persistence, replacing per-project JSON files with a single append-only `knowledge_graph.ndjson` file. It eliminates the `ProjectManager` class and all legacy project management concepts, embedding project context in `DagNode` entries via `projectContext` from `ActorThinkSchema`. The redesign prioritizes simplicity, performance, and reliability, with no support for legacy workflows.

### 1.2 Scope

The redesign:

- Centralizes persistence in `knowledge_graph.ndjson`.
- Removes `ProjectManager` and related methods (`switchProject`, `switchProjectIfNeeded`, `getCurrentProject`, `flush`).
- Derives `DagNode.project` from `projectContext` in every `actor_think` call.
- Updates `KnowledgeGraphManager` in `src/engine/KnowledgeGraph.ts` for streaming persistence and project-scoped operations.
- Modifies `index.ts` tools to pass `projectContext` explicitly.
- Excludes legacy compatibility, requiring updates to all dependent workflows.

Metrics implementation is deferred to a separate document.

### 1.3 Audience

- Developers implementing the redesign
- Technical leads reviewing the architecture
- Stakeholders evaluating scalability and reliability

### 1.4 References

- [CodeLoops GitHub Repository](https://github.com/silvabyte/codeloops)
- [CodeLoops Overview](https://bytes.silvabyte.com/improving-coding-agents-an-early-look-at-codeloops-for-building-more-reliable-software/)

## 2. System Overview

### 2.1 Current System

- **Per-Project JSON Files**: Knowledge graphs are stored in `kg.<projectName>.json`.
- **ProjectManager**: Manages project creation, switching, and validation via file operations.
- **KnowledgeGraphManager**: Handles persistence and queries, tied to project-specific files.
- **Config**: Defines paths and global `currentProject` state.

This setup is complex, file-heavy, and unscalable.

### 2.2 Proposed System

- **Centralized Persistence**: All nodes are stored in `knowledge_graph.ndjson`, with `DagNode.project` derived from `projectContext`.
- **No Project Management**: Eliminates `ProjectManager`, `currentProject`, and switching logic.
- **Project-Scoped Operations**: All methods accept a `project` or `projectContext` parameter.
- **In-Memory State**: Caches project states in `projectStates` for fast access.
- **Streaming**: Uses streaming APIs for log operations.
- **Reliability**: Ensures zero data loss via atomic appends.

### 2.3 Objectives

- Centralize persistence in `knowledge_graph.ndjson`.
- Remove all project management logic and legacy methods.
- Derive `project` from `projectContext` for all writes.
- Optimize performance with streaming and caching.
- Ensure zero data loss for 100 saves across 5 projects.
- Log `node_append` and `state_recompute` events.

## 3. Requirements

### 3.1 Functional Requirements

- Append all nodes to `knowledge_graph.ndjson`.
- Set `DagNode.project` from `projectContext` in `ActorThinkSchema`.
- Reconstruct project states by filtering log by `project` (latest node per ID).
- Cache project states in memory.
- Use streaming APIs for log reads/writes.
- Scope all queries by `project` parameter.
- Log `node_append` and `state_recompute` events.
- Update `index.ts` tools to use `projectContext`.

### 3.2 Non-Functional Requirements

- **Reliability**: Zero data loss for 100 saves across 5 projects.
- **Performance**: Low-latency log processing and state updates.
- **Scalability**: Handle multiple projects without file proliferation.
- **Simplicity**: Minimize codebase complexity by removing legacy components.

### 3.3 Success Metrics

- Zero data loss across 100 saves in 5 projects (metrics deferred).
- Complete removal of `ProjectManager` and legacy methods.
- All operations scoped by `project` or `projectContext`.

## 4. System Design

### 4.1 Architecture Overview

The system uses a single `knowledge_graph.ndjson` file for persistence, with `KnowledgeGraphManager` managing all operations. Project context is derived from `projectContext` and embedded in `DagNode.project`. Queries are scoped by explicit `project` parameters, and in-memory caching ensures performance.

**Key Components**:

- **knowledge_graph.ndjson**: Stores all nodes with project tags.
- **KnowledgeGraphManager**: Handles persistence, state, and queries.
- **In-Memory Cache**: Maps project names to entity collections.

### 4.2 Data Schema

#### 4.2.1 DagNode

```typescript
export interface DagNode extends ActorThinkInput {
  id: string;
  project: string; // Derived from projectContext
  thought: string;
  role: 'actor' | 'critic' | 'summary';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string;
  parents: string[];
  children: string[]; // Retained for query performance
  createdAt: string;
  summarizedSegment?: string[];
}
```

#### 4.2.2 ArtifactRef

```typescript
export interface ArtifactRef extends FileRef {
  id: string;
  project: string; // Derived from projectContext
}
```

#### 4.2.3 ActorThinkSchema

```typescript
export const ActorThinkSchema = {
  thought: z.string().describe(THOUGHT_DESCRIPTION),
  branchLabel: z
    .string()
    .optional()
    .describe('Human-friendly name for the first node of an alternative branch.'),
  projectContext: z
    .string()
    .describe('Full path to the currently open directory in the code editor.'),
  tags: z
    .array(z.string())
    .min(1, 'Add at least one semantic tag – requirement, task, risk, design …'),
  artifacts: z.array(FILE_REF).describe('Files produced or updated by this thought.'),
};
```

**Notes**:

- `children` is retained in `DagNode` for faster `getChildren` queries, reducing the need to scan all nodes.
- No separate `relations` array; relations are derived from `parents`, `children`, and `target`.

#### 4.2.4 NDJSON Format

Each line is a JSON object for a `DagNode` or `ArtifactRef`.

**Example**:

```json
{"id":"node1","project":"proj1","thought":"Create main.ts","role":"actor","parents":[],"children":[],"createdAt":"2025-05-14T10:02:00Z","tags":["task"]}
{"id":"art1","project":"proj1","name":"main.ts","path":"src/main.ts"}
```

### 4.3 Persistence Mechanism

- **File**: `path.resolve(dataDir, 'knowledge_graph.ndjson')`.
- **Append-Only**: Updates append new entries; latest per `id` per project defines state.
- **Atomicity**: `fs.appendFile` ensures atomic writes.
- **Streaming**: Uses `readline` for reading, `fs.appendFile` for writing.

### 4.4 Project Context Derivation

- **Source**: `projectContext` from `ActorThinkSchema`.
- **Extraction**: Takes the last path segment, cleaned and validated:
  ```typescript
  private getProjectNameFromContext(projectContext?: string): string {
    if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') {
      return 'default';
    }
    const normalizedPath = path.normalize(projectContext);
    const lastSegment = path.basename(normalizedPath);
    const cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    return validNameRegex.test(cleanedProjectName) ? cleanedProjectName : 'default';
  }
  ```
- **Usage**: Sets `project` for `DagNode` and `ArtifactRef` in `appendEntity`.

### 4.5 State Management

- **Structure**:
  ```typescript
  private projectStates: Map<string, { entities: Map<string, DagNode | ArtifactRef> }> = new Map();
  ```
- **Initialization**: Stream log, build `projectStates` with latest entries per `id` per project.
- **Updates**: Appends update `projectStates` immediately.
- **Recomputation**: Full recomputation on startup; incremental updates thereafter.

### 4.6 Key Operations

- **Append Entity**:
  - Derive `project` from `projectContext`.
  - Append to `knowledge_graph.ndjson`.
  - Update `projectStates`.
- **Retrieve Node**:
  - Access `projectStates.get(project).entities.get(id)`.
- **Compute Relations**:
  - `getChildren`: Use `children` array.
  - `getParents`: Use `parents` array.
- **List Branches**:
  - Find nodes with no outgoing edges.
- **List Projects**:
  - Return keys from `projectStates`.

### 4.7 Logging

- **Events**:
  - `node_append`: On entity append.
  - `state_recompute`: On initialization.
- **Mechanism**: Uses `getLogger()`.

### 4.8 Updated KnowledgeGraphManager

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'readline';
import { dataDir } from '../config.ts';
import { getInstance as getLogger } from '../logger.ts';
import { ActorThinkInput, FileRef } from './ActorCriticEngine.ts';

export interface DagNode extends ActorThinkInput {
  id: string;
  project: string;
  thought: string;
  role: 'actor' | 'critic' | 'summary';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string;
  parents: string[];
  children: string[];
  createdAt: string;
  summarizedSegment?: string[];
}

export interface ArtifactRef extends FileRef {
  id: string;
  project: string;
}

export interface BranchHead {
  branchId: string;
  label?: string;
  head: DagNode;
  depth: number;
}

export interface SummaryNode extends DagNode {
  role: 'summary';
  summarizedSegment: string[];
}

export interface SummarizationResult {
  summary: SummaryNode | null;
  success: boolean;
  errorCode?:
    | 'BRANCH_NOT_FOUND'
    | 'INSUFFICIENT_NODES'
    | 'ALREADY_SUMMARIZED'
    | 'SUMMARIZATION_ERROR';
  errorMessage?: string;
  details?: string;
}

export class KnowledgeGraphManager {
  public static WINDOW = 20;

  private logFilePath: string = path.resolve(dataDir, 'knowledge_graph.ndjson');
  private projectStates: Map<string, { entities: Map<string, DagNode | ArtifactRef> }> = new Map();
  private logger = getLogger();
  public labelIndex: Map<string, string> = new Map();

  async init() {
    this.logger.info(`[KnowledgeGraphManager] Initializing from ${this.logFilePath}`);
    await this.loadLog();
    this.logger.info(`[KnowledgeGraphManager] state_recompute`);
  }

  private async loadLog() {
    if (!(await fs.stat(this.logFilePath).catch(() => null))) {
      this.logger.info(`[KnowledgeGraphManager] No log file found, starting fresh`);
      return;
    }
    const fileStream = fs.createReadStream(this.logFilePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
    for await (const line of rl) {
      try {
        const entry = JSON.parse(line);
        const project = entry.project;
        if (!this.projectStates.has(project)) {
          this.projectStates.set(project, { entities: new Map() });
        }
        this.projectStates.get(project)!.entities.set(entry.id, entry);
      } catch (err) {
        this.logger.error({ err, line }, 'Error parsing entry');
      }
    }
  }

  private getProjectNameFromContext(projectContext?: string): string {
    if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') {
      this.logger.info(`[KnowledgeGraphManager] No projectContext, using default`);
      return 'default';
    }
    const normalizedPath = path.normalize(projectContext);
    const lastSegment = path.basename(normalizedPath);
    const cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validNameRegex.test(cleanedProjectName)) {
      this.logger.info(
        `[KnowledgeGraphManager] Invalid project name: ${cleanedProjectName}, using default`,
      );
      return 'default';
    }
    returnAscertainability: true;
    return cleanedProjectName;
  }

  async appendEntity(entity: DagNode | ArtifactRef, projectContext: string) {
    const project = this.getProjectNameFromContext(projectContext);
    entity.project = project;
    entity.createdAt = new Date().toISOString();
    const line = JSON.stringify(entity) + '\n';
    await fs.appendFile(this.logFilePath, line, 'utf8');
    this.logger.info(`[KnowledgeGraphManager] node_append: ${entity.id} to project: ${project}`);
    const state = this.projectStates.get(project) || { entities: new Map() };
    state.entities.set(entity.id, entity);
    this.projectStates.set(project, state);
  }

  getNode(id: string, project: string): DagNode | undefined {
    const entity = this.projectStates.get(project)?.entities.get(id);
    return entity && 'role' in entity ? (entity as DagNode) : undefined;
  }

  getChildren(id: string, project: string): DagNode[] {
    const state = this.projectStates.get(project);
    if (!state) return [];
    return Array.from(state.entities.values()).filter(
      (entity): entity is DagNode => 'role' in entity && entity.children.includes(id),
    );
  }

  getHeads(project: string): DagNode[] {
    const state = this.projectStates.get(project);
    if (!state) return [];
    const hasOutgoing = new Set(
      Array.from(state.entities.values())
        .filter((e): e is DagNode => 'role' in e)
        .flatMap((n) => n.parents),
    );
    return Array.from(state.entities.values()).filter(
      (n): n is DagNode => 'role' in n && !hasOutgoing.has(n.id),
    );
  }

  allDagNodes(project: string): DagNode[] {
    const state = this.projectStates.get(project);
    if (!state) return [];
    return Array.from(state.entities.values()).filter((e): e is DagNode => 'role' in e);
  }

  listBranches(project: string): BranchHead[] {
    return this.getHeads(project).map((head) => ({
      branchId: head.id,
      label: head.branchLabel,
      head,
      depth: this.depth(head.id, project),
    }));
  }

  createEntity(entity: DagNode | ArtifactRef, projectContext: string) {
    this.appendEntity(entity, projectContext);
  }

  resume(branchIdOrLabel: string, project: string): string {
    const id = this.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    const node = this.getNode(id, project);
    if (!node) throw new Error('branch not found');

    const path: DagNode[] = [];
    let curr: DagNode | undefined = node;
    while (curr && path.length < KnowledgeGraphManager.WINDOW) {
      path.unshift(curr);
      curr = curr.parents[0] ? this.getNode(curr.parents[0], project) : undefined;
    }

    if (curr) {
      const summaries = this.allDagNodes(project)
        .filter(
          (n): n is SummaryNode => n.role === 'summary' && n.summarizedSegment?.includes(curr!.id),
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      path.unshift(...summaries);
    }

    return path.map((n) => n.thought).join('\n');
  }

  exportPlan(project: string, filterTag?: string): unknown {
    const nodes = this.allDagNodes(project).filter((n) =>
      filterTag ? n.tags?.includes(filterTag) : true,
    );
    return nodes.map((n) => ({
      id: n.id,
      thought: n.thought,
      tags: n.tags,
      branchLabel: n.branchLabel,
      verdict: n.verdict,
      parents: n.parents,
      children: n.children,
      artifacts: n.artifacts?.map((a) => ({ name: a.name, uri: a.uri, path: a.path })),
    }));
  }

  listProjects(): string[] {
    return Array.from(this.projectStates.keys());
  }

  private depth(id: string, project: string): number {
    let d = 0;
    let n: DagNode | undefined = this.getNode(id, project);
    while (n && n.parents.length) {
      d += 1;
      n = this.getNode(n.parents[0], project);
    }
    return d;
  }
}
```

### 4.9 Integration Points

- **index.ts**: Update all tools to pass `projectContext` or `project`:
  - **actor_think**: Pass `args.projectContext` to `engine.actorThink`.
  - **resume**:
    ```typescript
    server.tool(
      'resume',
      {
        branchId: z.string().describe('Branch id OR label'),
        projectContext: z.string().describe('Project context to derive project name'),
      },
      async (a) => ({
        content: [
          {
            type: 'text',
            text: kg.resume(a.branchId, kg.getProjectNameFromContext(a.projectContext)),
          },
        ],
      }),
    );
    ```
  - **list_branches**, **export_plan**, **summarize_branch**: Add `projectContext` parameter.
  - **list_projects**: Use `kg.listProjects()`.
  - **Removed Tools**: `switch_project`, `create_project` (projects are implicit via `projectContext`).
- **ActorCriticEngine**: Pass `projectContext` to `KnowledgeGraphManager` methods.
- **Config**: Remove all `ProjectManager`-related settings; retain `dataDir`.

### 4.10 Error Handling

- **Invalid projectContext**: Default to `default` project; log warning.
- **Log Parsing Errors**: Skip invalid NDJSON lines, log errors.
- **Missing Log File**: Start fresh.

## 5. Implementation Plan

### 5.1 Development Phases

1. **Phase 1: Schema and Cleanup** (1 day)
   - Update `DagNode` and `ArtifactRef`.
   - Remove `ProjectManager`, `switchProject`, `switchProjectIfNeeded`, `getCurrentProject`, `flush`.
2. **Phase 2: Persistence** (2 days)
   - Implement NDJSON streaming and `project` derivation.
   - Build `projectStates` cache.
3. **Phase 3: API Updates** (1 day)
   - Add `project` parameters to all methods.
   - Update `index.ts` tools.
4. **Phase 4: Testing** (2 days)
   - Unit tests: `appendEntity`, `getNode`, `listProjects`.
   - Integration tests: 100 saves across 5 projects.
5. **Phase 5: Deployment** (1 day)
   - Migrate JSON files to NDJSON.
   - Deploy and monitor.

### 5.2 Migration Strategy

- **Script**: Convert `kg.<projectName>.json` to `knowledge_graph.ndjson`, setting `project` and populating `children` based on `parents`.
- **No Legacy Support**: Workflows must update to use `projectContext`.

### 5.3 Testing Strategy

- **Unit Tests**:
  - `appendEntity`: Verify `project` derivation and NDJSON writes.
  - `getChildren`: Test `children` performance and consistency.
  - `listProjects`: Check unique project names.
- **Integration Tests**:
  - 100 saves across 5 projects, verify zero data loss.
  - Project scoping via `projectContext`.
- **Stress Tests**:
  - Process 10,000+ NDJSON entries.

## 6. Risks and Mitigations

| Risk                  | Impact | Mitigation                               |
| --------------------- | ------ | ---------------------------------------- |
| Migration data loss   | High   | Test migration script; backup JSON files |
| Workflow breakage     | High   | Document new API; update all clients     |
| Large log performance | Medium | Optimize streaming; plan rotation        |
| Concurrency           | Medium | Assume single-process; plan locking      |

## 7. Assumptions and Constraints

### 7.1 Assumptions

- Single-process operation.
- `projectContext` provided in `actor_think`.
- Existing logger sufficient.

### 7.2 Constraints

- Node.js environment.
- No legacy support.

## 8. Future Considerations

- **Log Rotation**: Size- or time-based rotation.
- **Concurrency**: File locking for multi-process.
- **Indexing**: Optimize queries with project/ID indexes.

## 9. Conclusion

This breaking change fully eliminates legacy project management, centralizing persistence in `knowledge_graph.ndjson` and scoping operations via `projectContext`. It simplifies the codebase, enhances performance, and ensures reliability, meeting all requirements for a scalable knowledge graph system.

## 10. Appendices

### 10.1 Glossary

- **NDJSON**: Newline-Delimited JSON.
- **DagNode**: Knowledge graph node with project context.
- **projectContext**: Directory path for project name derivation.

### 10.2 Related Documents

- Metrics API Design Document (TBD)

---

**Approval**

| Role           | Name | Signature | Date |
| -------------- | ---- | --------- | ---- |
| Technical Lead | TBD  |           |      |
| Developer      | TBD  |           |      |

_Generated by Grok (xAI) on May 14, 2025, 10:02 AM EDT_
