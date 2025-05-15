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
