### Current State

- [x] MCP
  - [x] ActorCriticEngine
    - [x] Critic wrapper
    - [x] Actor wrapper
    - [x] RevisionCounter
    - [x] KnowledgeGraphManager
  - [x] MCP Server (stdio)
  - [x] MCP Tools
    - [x] actor_think
    - [x] critic_review
    - [x] list_branches
    - [x] summarize_branch
    - [x] resume
    - [x] export_plan
- [x] Agents
  - [x] Actor
  - [x] Critic
  - [x] Summarization

### Next Steps

## 1. Implement Active Retrieval Tools

These tools are essential for addressing the temporal difference problem by allowing agents to retrieve specific information from the knowledge graph.

- [ ] **search_plan Tool**

  - Input: `{ text: string, tag?: string }`
  - Purpose: Keyword/semantic search over all DagNodes
  - Implementation: Add to `src/index.ts` as an MCP tool
  - Details:
    - Start with simple `includes()` search over thought strings
    - Add tag filtering capability
    - Return top-K hits with id, thought, and tags
    - Consider adding vector embedding search in future iterations

- [ ] **get_node Tool**

  - Input: `{ nodeId: string }`
  - Purpose: Fetch a single node and its artifact references
  - Implementation: Add to `src/index.ts` as an MCP tool
  - Details:
    - Leverage existing `KnowledgeGraphManager.getNode()` method
    - Enhance to include artifact references

- [ ] **get_artifact Tool**
  - Input: `{ artifactId: string }`
  - Purpose: Stream attached file or link metadata
  - Implementation: Add to `src/index.ts` as an MCP tool
  - Details:
    - Create method to retrieve artifact by ID
    - Return metadata and content if available

## 2. Implement Automatic Summarization

This feature helps maintain high-level understanding as context scrolls out of the LLM's token window.

- [x] **Create Summarization Agent**

  - Implementation: Standalone agent using fastagent
  - Location: Create `src/agents/summarize_agent.ts`
  - Details:
    - Use fastagent for efficient summary tasks
    - Implement as callable via exec: `exec('uv run agent.py --agent default --message "Summarize this segment"')`
    - Define interface for integration with MCP

- [ ] **Implement Rolling Summaries**

  - Purpose: After N nodes, summarize oldest segment
  - Implementation: Enhance `KnowledgeGraphManager`
  - Details:
    - Add method to chunk oldest segments
    - Call summarization agent
    - Store summary as observation linked to branch
    - Modify `resume` to include summaries when needed

- [ ] **Implement Tagged Glossaries**
  - Purpose: Tag definition nodes for easy retrieval
  - Implementation: Enhance `Actor.think()` method
  - Details:
    - Add special handling for nodes tagged with "definition"
    - Ensure these are easily searchable via `search_plan`

## 3. Enhance Critic with Duplicate Detection

This feature helps prevent reinventing components with slightly different names or structures.

- [ ] **Implement Critic-side Duplicate Detection**

  - Purpose: Detect when an actor proposes a component similar to an existing one
  - Implementation: Enhance `Critic.review()` method
  - Details:
    - Scan graph for nodes with similar tags/names
    - Implement fuzzy matching for component names
    - Set `verdict = needs_revision` when duplicates found
    - Add references to original components

- [x] **Add verdictReason and verdictReferences Usage**

---

## Open Issues & Observations (from todos.md)

- Projects current design only allows for one project at a time, basically one open coding editor... need to support multiple projects at once.
- Did not correctly save my latest changes to the knowledge graph for the prismatic work for aka.
- Had to feed it a diff....
- Actor will say needsMore: true but then forget about codeloops and never come back to complete the plan via adding more thoughts.
  - Just remove the ability to say needsMore: true and always provide critic feedback.
  - The actor can just include more context in the thought to provide more information.
- Actor did not collocate types, it redundantly separated types from hooks files... need an actor to enforce these type of preferences.
- Actor used the tool initially but then...
- Simplify summarize agent: remove summarize agent in favor of just using the actor agent to summarize by submitting a new thought to the critic.
- branchLabel isn't currently adding any value or being used... remove it.
- The actor said it had removed dead code file paths but it did not. The critic should have detected this and asked for revision.
  - This can be done with a specialized context agent that uses the tree walker to compare the summary of changes to what was actually changed...
  - It can also use a grep on the codebase to find any references to the dead code file paths and provide feedback to the actor.
  - I think a reusable tree + grep agent would be useful for this that simply tries to find any references to the desired file paths or code. This can be used by duplicate detection agent and dead code agent.

### Observations

- 3.7 sonnet intuitively knows how to use codeloops iteratively

### Knowledge Graph Workflow Ideas

- Directory for each project
- Should have current state file of knowledge graph
- Should have append-only history of knowledge graph
- Current state is always recomputed from history and saved anytime a change is made

  - Purpose: Provide context for why revision is needed
  - Implementation: Update `Critic.review()` method
  - Details:
    - Populate `verdictReason` with explanation
    - Add `verdictReferences` with nodeIds of similar components
    - Update critic node thought to include reason

- [x] **Consider Standalone Critic Agent**
  - Purpose: More advanced duplicate detection and analysis
  - Implementation: Create `src/agents/critic_agent.ts`
  - Details:
    - Implement as callable via exec
    - Integrate with main MCP

## 4. Implement Duplicate/Dead Code Cleanup

This feature ensures the final codebase is clean and consistent.

- [ ] **Implement Decision Tree Walker**
  - Purpose: Walk the decision tree and compare to diffs
  - Implementation: Add new tool or agent
  - Details:
    - Compare knowledge graph to actual code changes
    - Identify unused or duplicated code
    - Suggest cleanup actions

## 5. Improve Agent Usage Guidelines

This ensures agents make effective use of the memory system.

- [ ] **Create Agent Prompt Templates**

  - Purpose: Guide agents in using memory effectively
  - Implementation: Create `src/prompts/agent_guidelines.ts`
  - Details:
    - Include best practices for memory hygiene
    - Specify retrieval routines (search before implementing, tag after writing)
    - Add examples of effective memory usage

- [ ] **Update System Prompts**
  - Purpose: Incorporate memory guidelines into agent prompts
  - Implementation: Update agent initialization
  - Details:
    - Add memory hygiene section to system prompts
    - Include specific instructions for using retrieval tools

## 6. Additional Enhancements

- [x] **Implement projects**

  - Purpose: Organize knowledge graphs(kg) by projects
  - Implementation: Add project management tools
  - Details:
    - ability to create and switch between kg projects

- [ ] **Implement tidy agent**

  - Purpose: Clean up codebase based on knowledge graph
  - Implementation: Add new agent or tool
  - Details:
    - Compare knowledge graph to actual code changes (can have actor list final files in summary and compare to files from the git diff)
    - Identify unused or duplicated code
    - Suggest cleanup actions

- [ ] **Implement ndjson for knowledgegraph persistence**

  - Purpose: easy analysis and querying
  - Motivation: as the knowledge graph grows, it becomes more difficult to analyze and query the data in its current format, since it all needs to be loaded into memory.
  - Implementation: Rework knowledgegraph apis to use ndjson/streaming as needed
