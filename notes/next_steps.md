CodeLoops Development Roadmap
Overview
CodeLoops is a framework for building reliable software using collaborative AI agents and a knowledge graph. This roadmap outlines prioritized tasks, critical issues, and key insights to enhance agent collaboration, codebase quality, and system scalability.
Next Steps

1. Enhance Critic Agent
   Improve feedback to prevent redundant work.

Duplicate Detection
Purpose: Flag similar components proposed by Actor
Implementation: Update Critic.review() with fuzzy matching
Details: Set verdict = needs_revision for duplicates, include verdictReferences to original nodes

2. Streamline Codebase Maintenance
   Ensure a clean, consistent codebase through automated cleanup.

Code Consistency Agent
Purpose: Detect and remove unused/duplicated code
Implementation: Develop a tool/agent combining decision tree walking and tidy functionality
Details:
Compare knowledge graph to git diffs
Verify Actor summaries against actual changes
Suggest cleanup actions

3. Optimize Knowledge Graph Persistence
   Enhance scalability and query efficiency.

NDJSON Streaming
Purpose: Support large-scale graph analysis
Implementation: Rework KnowledgeGraphManager for NDJSON/streaming APIs
Details: Reduce memory load by enabling incremental data access

4. Standardize Agent Guidelines
   Improve agent efficiency and memory usage.

Prompt Framework
Purpose: Guide agents in consistent memory and tool usage
Implementation: Create src/prompts/agent_guidelines.ts and update system prompts
Details:
Define memory hygiene and retrieval routines
Provide examples for search-before-implement and tag-after-write

Open Issues
Agent Behavior and Feedback

Incomplete Plans: Actor fails to revisit tasks after setting needsMore: true. Remove needsMore and enforce Critic feedback with full context in thoughts.
Code Organization: Actor separates types from hooks files redundantly. Implement an agent to enforce collocation.
Verification Gaps: Actor claims to remove dead code but doesn’t. Enhance Critic to detect discrepancies using a context agent with tree walker and grep.

System Limitations

Single Project Support: Design limits to one active project. Add multi-project functionality.
Unused Features: branchLabel adds no value. Remove it.
Summarization Redundancy: Replace standalone summarization agent with Actor-driven summary thoughts submitted to Critic.

Persistence Challenges

Data Loss: Recent changes (e.g., prismatic work) not saved, requiring manual diffs. Improve knowledge graph reliability.
Scalability: Current graph format loads fully into memory. Transition to NDJSON for better querying.

Key Insights

Model Compatibility: Claude 3.7 Sonnet iteratively uses CodeLoops effectively, suggesting strong potential for advanced LLM integration.
Workflow Optimization:
Store projects in dedicated directories with current state and append-only history files.
Recompute and save graph state after changes to ensure consistency.
