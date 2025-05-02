# Actor-Critic MCP: Solving Temporal Difference Problems in AI Agents

This project aims to solve the overall issue of temporal difference problems in AI agents. More specifically for software development agents.

\*\* Note that while the current implementation is an MCP, it is enirely possible to implement this via agents(standalone, or even embedded in the mcp or agent).

- See [notes/next_steps.md](notes/next_steps.md) for current implementation state and proposed next steps.
- See [What is a temporal difference problem?](#what-is-a-temporal-difference-problem) for a more detailed explanation.]

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

---

### What is a temporal difference problem?\*\*

An example: when an AI wins or loses a game of chess, it might not remember the specific moves it made earlier in the game that led to that outcome. This is a temporal difference problem, the result comes much later than the decisions that influenced it.

This ties directly into another concept: the credit assignment problem.

---

**What is the credit assignment problem?**

To build on the example above: how does the AI figure out which specific moves actually contributed to the win or loss? Not all moves mattered equally. The AI needs to assign credit (or blame) across a timeline of actions.

---

**How do the two connect?**

The temporal difference problem is about **delayed consequences**. Decisions made now might not show their results until much later.
The credit assignment problem is about **figuring out which of those decisions mattered most** when the result finally does come.

Together, they form one of the most challenging problems in long-horizon reasoning.

---

**How was this solved?**

This was a sticky problem for a long time, but one of the more effective approaches turned out to be the actor–critic model.

Here’s how it works:

- The **actor** is responsible for making decisions (moves, in the chess example).
- The **critic** provides feedback. It evaluates whether those decisions seem likely to lead to a good outcome.
- If the critic believes the actor’s move is good, the actor continues. If not, the actor tries a better move.

Over time, the actor learns which moves tend to lead to good results, even if the payoff comes much later. This model helps the AI assign value to intermediate steps, instead of only learning from the final outcome.

---

I am hoping to apply these concepts to AI agents in software development, which I believe is largely missing from existing coding agents.
