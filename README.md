# Actor-Critic MCP: Solving Temporal Difference Problems in AI Agents

This project aims to solve the overall issue of temporal difference problems in AI agents. More specifically for software development agents.

\*\* Note that while the current implementation is an MCP, it is enirely possible to implement this via agents(standalone, or even embedded in the mcp or agent).

See [notes/next_steps.md](notes/next_steps.md) for current implementation state and proposed next steps.

### Temporal Difference Problems (AI Agent Context Gaps)

1. **Forgetting important past decisions**

   - The agent doesn’t recall prior API/component designs if they fall outside the `WINDOW` size.
   - This leads to **reinventing components** with slightly different names or structure.

2. **No automatic long-term memory abstraction**

   - There's no summarization of older nodes.
   - This causes **loss of high-level understanding** as context scrolls out of the LLM’s token window.

3. **Lack of proactive retrieval**

   - The agent doesn't always know to call `resume`, `search_plan`, or `export_plan`.
   - This results in **fragmented reasoning**, especially across long sessions.

4. **Duplicate or inconsistent artifacts**

   - Without fuzzy duplicate detection or linking nodes to a **single source of truth**, the agent may produce conflicting designs.
   - Critic needs `verdictReason` and `verdictReferences` to guide cleanup.

5. **Glossary/reference amnesia**

   - No structured **definition indexing** (e.g., tagging nodes as `["definition"]`) means the agent forgets prior schemas, interfaces, etc.

6. **Dead code and divergence from plan**

   - Without walking the graph or comparing to a real diff (e.g. Git or node snapshots), agents may **generate stale or unreferenced code paths**.

7. **Weak agent hygiene habits**

   - Agents aren’t instructed to always search, reuse, or tag key thoughts.
   - Leads to **improper reuse**, **missing links**, and **metadata drift**.

8. **Loss of intent hierarchy**

   - The agent forgets _why_ it’s doing a task—e.g., “this module exists to support multi-tenant billing”—and optimizes locally.
   - Without upstream intent or architectural goals visible, it may violate constraints or design principles.

9. **Stale assumptions**

   - Agent continues work based on outdated premises because it lacks a mechanism to revisit or invalidate earlier thoughts when context changes.
   - Example: A new constraint (“we can't use OAuth”) is added, but the agent keeps generating auth flows based on OAuth.

10. **Branch divergence without reconciliation**

- Different branches solve overlapping parts of the system, but no reconciliation step ensures final decisions are consolidated.
- Leads to **conflicting logic**, API duplication, or integration gaps.

11. **Low trust in memory content**

- The agent may distrust or ignore its own prior work because it wasn’t validated, tagged, or marked as finalized.
- Example: “I see we implemented `AuthClient`, but I’m not sure if that was the final version…”

12. **Inconsistent naming and terminology drift**

- The same concept may appear under different names in different parts of the graph (e.g., `UserProfile` vs `ProfileCard`).
- Without name normalization, semantic similarity, or alias tracking, the agent doesn't realize they're the same thing.

13. **Forgetting exploration outcomes**

- The agent tries strategies it previously abandoned because it doesn’t remember they were already rejected.
- Absence of negative results (`verdict = reject`) being reviewed again leads to **looping** or wasted exploration.

14. **Shallow linking between thoughts and code**

- Even with artifacts attached, there's often no explicit API-level linkage (e.g., “this node defines `AuthClient.login()`”).
- Agent may not know how to reason about implementation details that live in files vs thoughts.

15. **Poor use of observational memory**

- Observations (summarized context) are not structured or easily searchable.
- This can make summarization useless if it can't be _retrieved and applied_ intelligently later.

16. **No dependency tracking across branches**

- Changes in one branch (e.g., new auth model) aren’t propagated to others that depend on it.
- Leads to **logical inconsistencies** across the plan unless there's a dependency graph or change propagation.

17. **Forgetting open questions or deferred work**

    - Thoughts that defer resolution ("to be determined later", "will revisit validation rules") get buried and never resolved.
    - There’s no mechanism for a "follow-up" queue or return-to-this tag.

FUTURE GOALS/IDEAS:

- Specific actor/critic types
  - Security critic
  - UX critic
  - DevX critic
  - Performance critic
  - etc.
