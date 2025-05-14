# Technical Design Document: Redesign of Knowledge Graph Persistence and Project Management Elimination for CodeLoops

## Version History

| Version | Date       | Author     | Description                          |
| ------- | ---------- | ---------- | ------------------------------------ |
| 1.0     | 2025-05-14 | Grok (xAI) | Initial draft of the design document |

## 1. Introduction

### 1.1 Purpose

This document details the technical design for redesigning the knowledge graph persistence in the CodeLoops project, eliminating the `ProjectManager` class, and embedding project context directly within knowledge graph entries. The redesign centralizes persistence using a single append-only `knowledge_graph.ndjson` file, leverages the `projectContext` from `ActorThinkInput` to derive project names, and optimizes performance while ensuring data integrity.

### 1.2 Scope

The redesign focuses on:

- Replacing per-project JSON files with a unified `knowledge_graph.ndjson`.
- Eliminating `ProjectManager` by embedding project information in `DagNode` entries.
- Automatically deriving the `project` field from the `projectContext` provided in `ActorThinkSchema`.
- Updating `KnowledgeGraphManager` in `src/engine/KnowledgeGraph.ts` for streaming persistence and in-memory state management.
- Maintaining compatibility with existing tools in `index.ts`.

Metrics implementation is deferred to a separate design document.

### 1.3 Audience

- Developers implementing the redesign
- Technical leads reviewing the architecture
- Stakeholders evaluating system scalability and reliability

### 1.4 References

- [CodeLoops GitHub Repository](https://github.com/silvabyte/codeloops)
- [CodeLoops Overview](https://bytes.silvabyte.com/improving-coding-agents-an-early-look-at-codeloops-for-building-more-reliable-software/)
- Existing codebase: `KnowledgeGraph.ts`, `ProjectManager.ts`, `config.ts`, `index.ts`

## 2. System Overview

### 2.1 Current System

- **Per-Project JSON Files**: Knowledge graphs are stored in `kg.<projectName>.json` files.
- **ProjectManager**: Manages project creation, switching, and validation, relying on file operations.
- **KnowledgeGraphManager**: Handles entity persistence and queries, tied to project-specific files.
- **Config**: Defines paths and global `currentProject` state.

This setup results in file management overhead, redundant APIs, and scalability limitations.

### 2.2 Proposed System

- **Centralized Persistence**: All nodes are stored in `knowledge_graph.ndjson`, with each `DagNode` containing a `project` field derived from `projectContext`.
- **No ProjectManager**: Project context is embedded in nodes, eliminating the need for a separate manager.
- **In-Memory State**: Caches project-specific states for fast access, derived by replaying the log.
- **Streaming Operations**: Uses streaming APIs for efficient log processing.
- **Reliability**: Ensures zero data loss via atomic appends.

### 2.3 Objectives

- Centralize persistence in a single NDJSON file.
- Eliminate `ProjectManager` by embedding project data in nodes.
- Derive `project` automatically from `projectContext`.
- Optimize performance with streaming and caching.
- Ensure zero data loss for 100 saves across 5 projects.
- Log `node_append` and `state_recompute` events.

## 3. Requirements

### 3.1 Functional Requirements

- **Persistence**: Append all nodes to `knowledge_graph.ndjson`.
- **Project Tagging**: Set `DagNode.project` based on `projectContext` from `ActorThinkSchema`.
- **State Derivation**: Reconstruct project states by filtering log by `project` and replaying nodes (latest per ID).
- **Caching**: Maintain in-memory state per project.
- **Streaming**: Use streaming APIs for log operations.
- **Logging**: Record `node_append` and `state_recompute` events.
- **Compatibility**: Retain existing tool functionality in `index.ts`.

### 3.2 Non-Functional Requirements

- **Reliability**: Zero data loss for 100 saves across 5 projects.
- **Performance**: Low-latency state updates and log processing.
- **Scalability**: Handle multiple projects without file proliferation.
- **Maintainability**: Simplify codebase by removing `ProjectManager`.

### 3.3 Success Metrics

- Zero data loss across 100 saves in 5 projects (metrics deferred).
- Elimination of `ProjectManager`-related file operations.
- Seamless project filtering using `DagNode.project`.

## 4. System Design

### 4.1 Architecture Overview

The system centralizes persistence in `knowledge_graph.ndjson`, with `KnowledgeGraphManager` managing all operations. Project context is derived from `projectContext` in `ActorThinkSchema`, embedded in `DagNode.project`, and used for filtering. In-memory caching ensures fast access, and streaming APIs optimize performance.

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
  role: 'actor' | ' personally added children back because I think it will make queries faster for certain operations
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string;
  parents: string[];
  children: string[];
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

**Changes**:

- `project` in `DagNode` and `ArtifactRef` is set from `projectContext`.
- Reintroduced `children` in `DagNode` to optimize query performance for operations like `getChildren`.
- Removed separate `relations` array; relations are derived from `parents`, `children`, and `target`.

#### 4.2.4 NDJSON Format

Each line is a JSON object for a `DagNode` or `ArtifactRef`. Nodes have a `role`; artifacts do not.

**Example**:

```json
{"id":"node1","project":"proj1","thought":"Create main.ts","role":"actor","parents":[],"children":[],"createdAt":"2025-05-14T09:24:00Z","tags":["task"]}
{"id":"art1","project":"proj1","name":"main.ts","path":"src/main.ts"}
```

### 4.3 Persistence Mechanism

- **File**: `path.resolve(dataDir, 'knowledge_graph.ndjson')`.
- **Append-Only**: Updates append new entries; latest entry per `id` per project defines state.
- **Atomicity**: `fs.appendFile` ensures atomic writes.
- **Streaming**: Uses `readline` for reading, `fs.appendFile` for writing.

### 4.4 Project Context Derivation

- **Source**: `projectContext` from `ActorThinkSchema`, provided in every `actor_think` call.
- **Extraction**: Project name is the last segment of the normalized `projectContext` path, validated and cleaned:
  ```typescript
  private getProjectNameFromContext(projectContext: string): string | null {
    if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') return null;
    const normalizedPath = path.normalize(projectContext);
    const lastSegment = path.basename(normalizedPath);
    const cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    return validNameRegex.test(cleanedProjectName) ? cleanedProjectName : null;
  }
  ```
- **Usage**: Sets `DagNode.project` and `ArtifactRef.project` during `appendEntity`.

### 4.5 State Management

- **Structure**:
  ```typescript
  private projectStates: Map<string, { entities: Map<string, DagNode | ArtifactRef> }> = new Map();
  ```
- **Initialization**: Stream log, parse entries, and build `projectStates` with latest entries per `id` per project.
- **Updates**: Appends update in-memory state immediately.
- **Recomputation**: Full recomputation on startup; incremental updates thereafter.

### 4.6 Key Operations

- **Append Entity**:
  - Derive `entity.project` from `projectContext`.
  - Append to `knowledge_graph.ndjson`.
  - Update `projectStates`.
- **Retrieve Node**:
  - Access `projectStates.get(currentProject).entities.get(id)`, filter by `role`.
- **Compute Relations**:
  - `getChildren`: Use `children` array for fast access.
  - `getParents`: Use `parents` array.
- **List Branches**:
  - Identify nodes with no outgoing edges (no nodes list them as parents).
- **Switch Project**:
  - Update `currentProject` in memory; no file operations.

### 4.7 Logging

- **Events**:
  - `node_append`: On entity append.
  - `state_recompute`: On initialization.
- **Mechanism**: Uses existing `getLogger()`.

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
  private currentProject: string = 'default';
  private logger = getLogger();
  public labelIndex: Map<string, string> = new Map();

  constructor() {}

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

  private getProjectNameFromContext(projectContext: string): string | null {
    if (!projectContext || typeof projectContext !== 'string' || projectContext.trim() === '') {
      this.logger.info(`[KnowledgeGraphManager] Invalid projectContext: ${projectContext}`);
      return null;
    }
    const normalizedPath = path.normalize(projectContext);
    const lastSegment = path.basename(normalizedPath);
    const cleanedProjectName = lastSegment.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 50);
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!validNameRegex.test(cleanedProjectName)) {
      this.logger.info(`[KnowledgeGraphManager] Invalid project name: ${cleanedProjectName}`);
      return null;
    }
    return cleanedProjectName;
  }

  async appendEntity(entity: DagNode | ArtifactRef, projectContext: string) {
    const projectName = this.getProjectNameFromContext(projectContext);
    if (!projectName) {
      throw new Error('Invalid projectContext');
    }
    entity.project = projectName;
    entity.createdAt = new Date().toISOString();
    const line = JSON.stringify(entity) + '\n';
    await fs.appendFile(this.logFilePath, line, 'utf8');
    this.logger.info(
      `[KnowledgeGraphManager] node_append: ${entity.id} to project: ${projectName}`,
    );
    const state = this.projectStates.get(projectName) || { entities: new Map() };
    state.entities.set(entity.id, entity);
    this.projectStates.set(projectName, state);
  }

  getNode(id: string): DagNode | undefined {
    const entity = this.projectStates.get(this.currentProject)?.entities.get(id);
    return entity && 'role' in entity ? (entity as DagNode) : undefined;
  }

  getChildren(id: string): DagNode[] {
    const state = this.projectStates.get(this.currentProject);
    if (!state) return [];
    return Array.from(state.entities.values()).filter(
      (entity): entity is DagNode => 'role' in entity && entity.children.includes(id),
    );
  }

  getHeads(): DagNode[] {
    const state = this.projectStates.get(this.currentProject);
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

  allDagNodes(): DagNode[] {
    const state = this.projectStates.get(this.currentProject);
    if (!state) return [];
    return Array.from(state.entities.values()).filter((e): e is DagNode => 'role' in e);
  }

  listBranches(): BranchHead[] {
    return this.getHeads().map((head) => ({
      branchId: head.id,
      label: head.branchLabel,
      head,
      depth: this.depth(head.id),
    }));
  }

  async switchProject(projectName: string): Promise<{ success: boolean; message: string }> {
    const validNameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!projectName || !validNameRegex.test(projectName) || projectName.length > 50) {
      this.logger.error(`[KnowledgeGraphManager] Invalid project name: ${projectName}`);
      return { success: false, message: 'Invalid project name' };
    }
    this.currentProject = projectName;
    this.logger.info(`[KnowledgeGraphManager] Switched to project: ${projectName}`);
    return { success: true, message: `Switched to project: ${projectName}` };
  }

  getCurrentProject(): string {
    return this.currentProject;
  }

  async switchProjectIfNeeded(projectContext?: string): Promise<boolean> {
    if (!projectContext) {
      this.logger.info(
        `[KnowledgeGraphManager] No projectContext, staying with: ${this.currentProject}`,
      );
      return false;
    }
    const projectName = this.getProjectNameFromContext(projectContext);
    if (!projectName) {
      this.logger.info(`[KnowledgeGraphManager] Invalid projectContext: ${projectContext}`);
      return false;
    }
    this.currentProject = projectName;
    this.logger.info(`[KnowledgeGraphManager] Switched to project: ${projectName}`);
    return true;
  }

  async flush() {
    // No-op: Persistence handled by appendEntity
  }

  createEntity(entity: DagNode | ArtifactRef, projectContext: string) {
    this.appendEntity(entity, projectContext);
  }

  createRelation(from: string, to: string, type: string) {
    this.logger.warn('createRelation is deprecated; use node parents/children/target instead');
  }

  resume(branchIdOrLabel: string): string {
    const id = this.labelIndex.get(branchIdOrLabel) ?? branchIdOrLabel;
    const node = this.getNode(id);
    if (!node) throw new Error('branch not found');

    const path: DagNode[] = [];
    let curr: DagNode | undefined = node;
    while (curr && path.length < KnowledgeGraphManager.WINDOW) {
      path.unshift(curr);
      curr = curr.parents[0] ? this.getNode(curr.parents[0]) : undefined;
    }

    if (curr) {
      const summaries = this.allDagNodes()
        .filter(
          (n): n is SummaryNode => n.role === 'summary' && n.summarizedSegment?.includes(curr!.id),
        )
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      path.unshift(...summaries);
    }

    return path.map((n) => n.thought).join('\n');
  }

  exportPlan(filterTag?: string): unknown {
    const nodes = this.allDagNodes().filter((n) =>
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

  private depth(id: string): number {
    let d = 0;
    let n: DagNode | undefined = this.getNode(id);
    while (n && n.parents.length) {
      d += 1;
      n = this.getNode(n.parents[0]);
    }
    return d;
  }
}
```

### 4.9 Integration Points

- **index.ts**: Update to remove `ProjectManager` instantiation and pass `projectContext` to `createEntity`/`appendEntity`. Tools like `list_projects`, `switch_project`, and `create_project` are replaced or simplified:
  - `list_projects`: Use `KnowledgeGraphManager.listProjects()` to return unique `project` values.
  - `switch_project`: Call `KnowledgeGraphManager.switchProject(projectName)`.
  - `create_project`: Implicit via `projectContext` in `actor_think`.
- **ActorCriticEngine**: Pass `projectContext` to `KnowledgeGraphManager` methods.
- **Config**: Remove `ProjectManager`-related settings; retain `dataDir`.

### 4.10 Error Handling

- **Invalid projectContext**: Throw error in `appendEntity` if project name cannot be derived.
- **Log Parsing Errors**: Skip invalid NDJSON lines, log errors.
- **Missing Log File**: Start fresh if `knowledge_graph.ndjson` does not exist.

## 5. Implementation Plan

### 5.1 Development Phases

1. **Phase 1: Schema and Setup** (1 day)
   - Update `DagNode` and `ArtifactRef` with `project` and `children`.
   - Remove `ProjectManager` references in `KnowledgeGraphManager`.
2. **Phase 2: Persistence and State** (2 days)
   - Implement NDJSON streaming and `project` derivation.
   - Build `projectStates` cache and incremental updates.
3. **Phase 3: API Updates** (1 day)
   - Replace `ProjectManager` methods with `KnowledgeGraphManager` equivalents.
   - Update `index.ts` tools to use `projectContext`.
4. **Phase 4: Testing** (2 days)
   - Unit tests for `appendEntity`, `getNode`, `listProjects`.
   - Integration tests for 100 saves across 5 projects.
5. **Phase 5: Deployment** (1 day)
   - Migrate existing JSON files to NDJSON.
   - Deploy and monitor logs.

### 5.2 Migration Strategy

- **Script**: Convert `kg.<projectName>.json` files to `knowledge_graph.ndjson`, setting `project` to the project name.
- **Compatibility**: Remove `ProjectManager` after migration; log warnings for deprecated tools during transition.

### 5.3 Testing Strategy

- **Unit Tests**:
  - `appendEntity`: Verify `project` derivation and NDJSON writes.
  - `getChildren`: Confirm performance with `children` array.
  - `listProjects`: Check unique project names.
- **Integration Tests**:
  - 100 saves across 5 projects, verify zero data loss.
  - Project switching via `projectContext`.
- **Stress Tests**:
  - Process 10,000+ NDJSON entries for streaming performance.

## 6. Risks and Mitigations

| Risk                        | Impact | Mitigation                                        |
| --------------------------- | ------ | ------------------------------------------------- |
| Migration data loss         | High   | Test migration script; backup JSON files          |
| Performance with large logs | Medium | Optimize streaming; plan log rotation             |
| Concurrency (multi-process) | Medium | Assume single-process; plan locking later         |
| Tool compatibility          | Low    | Update `index.ts` tools; log deprecation warnings |

## 7. Assumptions and Constraints

### 7.1 Assumptions

- Single-process operation.
- `projectContext` provided in every `actor_think` call.
- Existing logger sufficient for events.

### 7.2 Constraints

- Node.js environment for file operations.
- Compatibility with `index.ts` tools.
- No immediate log rotation.

## 8. Future Considerations

- **Log Rotation**: Size- or time-based rotation for large logs.
- **Concurrency**: File locking for multi-process support.
- **Indexing**: Optimize queries with project/ID indexes.
- **Tool Cleanup**: Remove deprecated tools post-migration.

## 9. Conclusion

This redesign eliminates `ProjectManager`, centralizes persistence in `knowledge_graph.ndjson`, and derives project context from `projectContext`, simplifying the system while ensuring reliability and performance. It meets all requirements and sets the stage for scalable knowledge graph management.

## 10. Appendices

### 10.1 Glossary

- **NDJSON**: Newline-Delimited JSON.
- **DagNode**: Knowledge graph node with project context.
- **projectContext**: Directory path used to derive project name.

### 10.2 Related Documents

- Metrics API Design Document (TBD)
- CodeLoops System Architecture Overview

---

**Approval**

| Role           | Name | Signature | Date |
| -------------- | ---- | --------- | ---- |
| Technical Lead | TBD  |           |      |
| Developer      | TBD  |           |      |

_Generated by Grok (xAI) on May 14, 2025, 09:24 AM EDT_
