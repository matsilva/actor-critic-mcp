import asyncio, json, re, sys
from mcp_agent.core.fastagent import FastAgent

# --------------------------------------------------------------------------- #
#  Agent instruction                                                           #
# --------------------------------------------------------------------------- #

INSTRUCTION = r"""
You are the Summarization Agent in the CodeLoops system, responsible for creating
concise summaries of knowledge-graph segments.

## System Architecture
You are part of the CodeLoops system with these key components:
- KnowledgeGraphManager: Stores all nodes, artifacts, and relationships
- Actor: Generates new thought nodes and code
- Critic: Evaluates actor nodes and provides feedback
- Summarization Agent (you): Creates concise summaries of knowledge graph segments
- ActorCriticEngine: Coordinates the actor-critic loop

## DagNode Schema
```typescript
interface DagNode {
  id: string;
  thought: string;
  role: 'actor' | 'critic';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string;        // nodeId this criticises
  parents: string[];
  children: string[];
  createdAt: string;      // ISO timestamp
  projectContext: string; // full path to the open directory
  tags?: string[];        // categories ("design", "task", etc.)
  artifacts?: ArtifactRef[];
}
```

## Your Summarisation Process
1. Analyse the sequence of thoughts, focusing on key decisions, artifacts, and concepts
2. Identify the main themes and progression of work
3. Produce a concise summary (1–3 paragraphs)
4. Include references to important artifacts and definitions
5. Reply **only** with JSON: {"summary":"...", "error":""}

Guidelines: focus on high-level ideas, highlight artifacts, keep it brief yet clear.
"""

fast = FastAgent("CodeLoops Summarization Agent")


# --------------------------------------------------------------------------- #
#  Parsing and normalisation helpers                                          #
# --------------------------------------------------------------------------- #


def _first_json_object(text: str) -> dict:
    """Return the first balanced JSON object embedded in *text*."""
    start = text.find("{")
    if start == -1:
        raise json.JSONDecodeError("no opening brace", text, 0)

    depth, in_str, esc = 0, False, False
    for i, ch in enumerate(text[start:], start):
        if in_str:
            esc = not esc and ch == "\\" or (esc and False)
            in_str = not (ch == '"' and not esc) or in_str
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])

    raise json.JSONDecodeError("no balanced object", text, start)


def parse_and_normalize_reply(reply: str) -> dict:
    """Convert an LLM reply into {"summary": str, "error": str}."""
    last_err = "unknown parsing failure"

    # scenario: normal json response
    try:
        if reply.lstrip().startswith("{"):
            data = json.loads(reply)
            return {"summary": data.get("summary", ""), "error": data.get("error", "")}
    except json.JSONDecodeError as e:
        last_err = f"direct load failed → {e}"

    # scenario: fenced block
    unfenced = re.sub(r"^\s*```(?:json)?\s*|\s*```$", "", reply, flags=re.DOTALL)
    if unfenced != reply:
        try:
            data = json.loads(unfenced)
            return {"summary": data.get("summary", ""), "error": data.get("error", "")}
        except json.JSONDecodeError as e:
            last_err = f"fenced load failed → {e}"

    # scenario: get first json object if llm is too chatty
    try:
        data = _first_json_object(reply)
        return {"summary": data.get("summary", ""), "error": data.get("error", "")}
    except (json.JSONDecodeError, ValueError) as e:
        last_err = f"embedded object failed → {e}"

    # scenario: fallback to plain text in case of exausted failure scenarios
    if reply.strip():
        return {"summary": reply.strip(), "error": ""}

    return {"summary": "", "error": last_err}


# --------------------------------------------------------------------------- #
#  Agent runtime                                                               #
# --------------------------------------------------------------------------- #


@fast.agent(instruction=INSTRUCTION)
async def main():
    async with fast.run() as agent:

        async def summarise(nodes: list[dict]) -> dict:
            prompt = (
                "Please summarise the following knowledge-graph segment:\n\n"
                + json.dumps(nodes, indent=2)
            )
            reply = await agent.send(prompt)

            for _ in range(2):  # allow one correction round
                result = parse_and_normalize_reply(reply)
                if result["error"]:
                    reply = await agent.send(
                        'Respond ONLY with valid JSON: {"summary":"...", "error":""}'
                    )
                else:
                    return result

            return {"summary": "", "error": "agent returned unparsable output twice"}

        # retain CLI flag for programmatic callers ---------------------------------
        if "--summarize" in sys.argv:
            try:
                data = json.load(sys.stdin)
                if not isinstance(data, list) or not data:
                    raise ValueError("Input must be a non-empty JSON array of nodes")
                print(json.dumps(await summarise(data)))
            except Exception as err:
                print(json.dumps({"summary": "", "error": str(err)}))
        else:
            # choose mode automatically when run via fast-agent CLI helpers
            if sys.stdin.isatty():
                await agent.interactive()
            else:
                try:
                    data = json.load(sys.stdin)
                    print(json.dumps(await summarise(data)))
                except Exception as err:
                    print(json.dumps({"summary": "", "error": str(err)}))


if __name__ == "__main__":
    asyncio.run(main())
