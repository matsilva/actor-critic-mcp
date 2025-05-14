CodeLoops Development Roadmap
Overview
CodeLoops is a framework for reliable software development using collaborative AI agents and a knowledge graph. This roadmap prioritizes tasks, addresses critical issues, and leverages insights to enhance agent collaboration, codebase quality, scalability, usability, and performance tracking.
Next Steps

1. Implement Metrics Tracking Framework

Priority: High
Purpose: Enable quantitative tracking of system performance (e.g., Critic's duplicate detection accuracy)
Implementation: Create MetricsTracker in src/core/metrics.ts
Details:
Log metrics to NDJSON file (metrics.ndjson) with fields: timestamp, event_type (e.g., duplicate_miss), details (e.g., node IDs)
Support counters (e.g., missed duplicates) and rates (e.g., detection accuracy)
Provide query API for analysis (e.g., getMetric('duplicate_miss', last_7d))
Integrate with MCP tools: view-metrics <event_type>

Success Metric: Track 100% of defined events with < 1ms logging overhead; query accuracy 100%
Dependencies: None

2. Optimize Knowledge Graph Persistence

Priority: High
Purpose: Enable efficient analysis and querying of large knowledge graphs
Implementation: Rework KnowledgeGraphManager APIs to use NDJSON/streaming
Details:
Store graph updates in projects/<project_id>/graph.ndjson
Implement streaming read/write in src/core/knowledge_graph.ts
Log persistence events (e.g., save_success, save_failure) to MetricsTracker

Success Metric: Process 10,000 nodes with < 1GB memory; query latency < 100ms; zero save failures in 100 attempts
Dependencies: Task 1 (metrics for save failures)

3. Enhance Critic Agent

Priority: High
Purpose: Prevent redundant work by flagging similar components
Implementation: Update Critic.review() in src/agents/critic.ts with fuzzy matching
Details:
Use fuzzywuzzy library (threshold: 85%) for tag/name similarity
Set verdict = needs_revision for duplicates; include verdictReferences
Log duplicate_detected and duplicate_miss to MetricsTracker by comparing Critic output to manual reviews

Success Metric: Reduce redundant components by 80% in test projects; < 5% missed duplicates in logs
Dependencies: Task 1 (metrics for detection accuracy), Task 2 (graph for scanning)

4. Streamline Codebase Maintenance

Priority: Medium
Purpose: Ensure a clean codebase by removing unused/duplicated code
Implementation: Develop CodeConsistencyAgent in src/agents/consistency.ts
Details:
Use ast module for tree walking; grep for diff-to-graph comparison
Verify Actor summaries against git diff --name-only
Log dead_code_detected and cleanup_applied to MetricsTracker

Success Metric: Detect 95% of dead code paths; apply cleanup without errors; log 100% of cleanup events
Dependencies: Task 1 (metrics), Task 2 (graph comparisons)

5. Enable Multi-Project Support

Priority: Medium
Purpose: Support multiple active projects for complex workflows
Implementation: Create MultiProjectManager in src/agents/multi_project_manager.ts
Details:
Store graphs in projects/<project_id>/
Add MCP tools: switch_project, list_projects
Cache queries; log cache hits/misses to MetricsTracker

Success Metric: Switch between 5 projects in < 1s; no cross-project leaks; > 80% cache hit rate
Dependencies: Task 1 (metrics), Task 2 (persistence)

6. Standardize Agent Guidelines

Priority: Medium
Purpose: Ensure consistent agent memory and tool usage
Implementation: Create src/prompts/agent_guidelines.ts; update system prompts
Details:
Memory hygiene: clear nodes > 100 revisions
Retrieval: mandate search_plan before thoughts
Sample prompt: "Search graph for hooks; tag definitions post-creation"
Log retrieval_compliance to MetricsTracker

Success Metric: 100% agent compliance in logs; zero non-compliant thoughts
Dependencies: Task 1 (metrics), Task 3 (Critic enforcement)

7. Develop Developer CLI

Priority: Low
Purpose: Enhance usability for graph inspection and management
Implementation: Create codeloops-cli in src/cli/main.ts
Details:
Commands: view-graph <project_id>, search-nodes <query>, export-graph
Output JSON/SVG; integrate with MCP server
Log cli_usage to MetricsTracker

Success Metric: < 2s latency for 10 commands; 90% developer satisfaction
Dependencies: Task 1 (metrics), Task 2 (graph), Task 5 (multi-project)

Open Issues
Agent Behavior and Feedback

Incomplete Plans:
Issue: Actor fails to revisit tasks post-needsMore
Resolution: Removed needsMore; enforce Critic feedback with full context
Metric: Zero unresolved plans after 10 iterations; track via MetricsTracker

Code Organization:
Issue: Actor separates types/hooks redundantly
Resolution: Use CodeConsistencyAgent for collocation
Metric: 100% type-hook collocation; log violations

Verification Gaps:
Issue: Actor claims dead code removal falsely
Resolution: Enhance Critic with tree walker/grep; log false_removal
Metric: Detect 95% false claims in logs

System Limitations

Single Project Support:
Issue: Limited to one project
Resolution: Implement Task 5
Metric: Support 5 projects; track leaks

Unused Features:
Issue: branchLabel unused
Resolution: Remove from src/core/
Metric: Zero branchLabel references

Summarization Redundancy:
Issue: Standalone summarization inefficient
Resolution: Actor-driven summaries to Critic
Metric: 50% latency reduction; track summary events

Persistence Challenges

Data Loss:
Issue: Changes (e.g., prismatic work) not saved
Resolution: Implement Task 2
Metric: 100 consecutive saves; log failures

Scalability:
Issue: Full graph memory load
Resolution: Implement Task 2
Metric: 10,000 nodes with < 1GB; log memory usage

Key Insights

Model Compatibility:
Claude 3.7 Sonnet’s iterative success suggests chunked thought prompts.
Action: Add to Task 6 prompt examples (e.g., "Submit thoughts in < 500 tokens").

Workflow Optimization:
Store projects in projects/<project_id>/ with graph.ndjson and history.ndjson.
Recompute state via src/core/recompute_state.ts.
Storage: ~10MB/1,000 nodes (NDJSON).
Action: Implement in Task 2; track storage in MetricsTracker.
