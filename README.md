# Actor-Critic MCP: Solving Temporal Difference Problems in AI Agents

This project aims to solve the overall issue of temporal difference problems in AI agents. More specifically for software development agents.

\*\* Note that while the current implementation is an MCP, it is enirely possible to implement this via agents(standalone, or even embedded in the mcp or agent).

See [notes/next_steps.md](notes/next_steps.md) for current implementation state and proposed next steps.

### Temporal Difference Problems (AI Agent Context Gaps)

1. **Forgetting prior definitions**  
   Agent forgets previously defined APIs, schemas, or components if they fall outside the context window or lack proper tagging (e.g. `["definition"]`). This leads to reinvention or misuse.

2. **Unstructured or missing summarization**  
   Older context isn’t compacted into summaries or stored in a retrievable format, degrading long-term reasoning and architectural continuity.

3. **Lack of proactive retrieval**  
   The agent doesn’t consistently call tools like `resume`, `search_plan`, or `export_plan`, leading to fragmented reasoning and missed context.

4. **Component duplication and naming drift**  
   Without deduplication heuristics or naming normalization, agents produce redundant or semantically identical components with inconsistent terminology.

5. **Low memory confidence and weak code linkage**  
   If prior thoughts aren’t validated, finalized, or linked to actual code artifacts, the agent may second-guess or ignore its own previous work.

6. **Dead code and divergence from plan**  
   Without walking the graph or comparing design intent to implementation (e.g. via Git or DAG diffs), agents may generate stale or unreferenced code.

7. **Weak agent hygiene habits**  
   Agents aren’t instructed to consistently search, reuse, tag, or validate nodes, leading to metadata drift and improper reuse.

8. **Loss of intent hierarchy**  
   The agent loses sight of upstream design goals and over-optimizes locally, violating architectural constraints or business requirements.

9. **Stale assumptions**  
   The agent builds on outdated premises due to lack of constraint invalidation or back-propagation of new requirements.

10. **Branch divergence without reconciliation**  
    Separate branches solving overlapping concerns may not converge, causing conflicting logic or duplicated effort.

11. **Forgetting exploration outcomes**  
    Previously rejected or abandoned ideas are revisited, wasting time and creating redundant forks.

12. **No dependency tracking across branches**  
    Changes in one branch (e.g., to an auth model) aren’t propagated to dependent branches, leading to logical inconsistencies.

13. **Forgetting open questions or deferred work**  
    Design questions marked “to be determined” or deferred get buried without resolution due to lack of follow-up tracking or re-surfacing.
