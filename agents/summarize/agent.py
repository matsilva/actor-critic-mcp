import asyncio
import json
import sys
from mcp_agent.core.fastagent import FastAgent

fast = FastAgent("CodeLoops Summarization Agent")


@fast.agent(
    instruction="""You are the Summarization Agent in the CodeLoops system, responsible for creating concise summaries of knowledge graph segments.

## System Architecture
You are part of the CodeLoops system with these key components:
- KnowledgeGraphManager: Stores all nodes, artifacts, and relationships
- Actor: Generates new thought nodes and code
- Critic: Evaluates actor nodes and provides feedback
- Summarization Agent (you): Creates concise summaries of knowledge graph segments
- ActorCriticEngine: Coordinates the actor-critic loop

## DagNode Schema
You summarize nodes with this structure:
```typescript
interface DagNode {
  id: string;
  thought: string;
  role: 'actor' | 'critic';
  verdict?: 'approved' | 'needs_revision' | 'reject';
  verdictReason?: string;
  verdictReferences?: string[];
  target?: string; // nodeId this criticises
  parents: string[];
  children: string[];
  createdAt: string; // ISO timestamp
  projectContext: string;// full path to the currently open directory in the code editor
  tags?: string[]; // categories ("design", "task", etc.)
  artifacts?: ArtifactRef[]; // attached artifacts
}
```

## Your Summarization Process
When summarizing a segment of nodes:
1. Analyze the sequence of thoughts, focusing on key decisions, artifacts, and concepts
2. Identify the main themes and progression of work
3. Create a concise summary (1-3 paragraphs) that captures the essential information
4. Include references to important artifacts and definitions
5. Respond with a JSON object containing the summary: {"summary": "your concise summary here"}

## Summarization Guidelines
- Focus on high-level concepts and decisions rather than implementation details
- Highlight key artifacts created or modified
- Mention important definitions or interfaces introduced
- Preserve the logical flow and progression of work
- Keep the summary concise but informative
- Ensure the summary provides enough context for someone to understand the work without seeing all the details

Remember: Your goal is to create summaries that help maintain high-level understanding as context scrolls out of the LLM's token window, enabling more effective long-term reasoning and planning.
"""
)
async def main():
    # use the --model command line switch or agent arguments to change model
    async with fast.run() as agent:
        if len(sys.argv) > 1 and sys.argv[1] == "--summarize":
            # Read input from stdin
            input_data = sys.stdin.read()
            print(f"Input: {input_data}", file=sys.stderr)
            try:
                # Parse the input as JSON
                nodes_data = json.loads(input_data)

                # Validate input
                if (
                    not nodes_data
                    or not isinstance(nodes_data, list)
                    or len(nodes_data) == 0
                ):
                    print(
                        json.dumps(
                            {
                                "error": "Invalid input: Expected non-empty array of nodes",
                                "summary": "",
                            }
                        )
                    )
                    return

                # Format the nodes data for the agent
                formatted_input = json.dumps(nodes_data, indent=2)

                try:
                    # Send the formatted input to the agent for summarization
                    response = await agent.send(
                        f"Please summarize the following knowledge graph segment:\n\n{formatted_input}"
                    )
                    print(f"Response: {response}", file=sys.stderr)

                    # Try to parse the response as JSON with retry logic
                    max_retries = 1
                    for attempt in range(max_retries + 1):
                        print(f"Response (attempt {attempt + 1}): {response}", file=sys.stderr)
                        try:
                            response_dict = json.loads(response) if response.startswith("{") else {"summary": response}
                            break
                        except json.JSONDecodeError as e:
                            if attempt == max_retries:
                                response_dict = {"summary": "", "error": f"Response parsing failed after retries: {str(e)}"}
                                break
                            # Retry with feedback
                            feedback_prompt = (
                                f"Your previous response was not valid JSON: {response}. "
                                'Please reformat it as a valid JSON object with "summary" and "error" fields, '
                                'like this: {"summary": "your summary", "error": ""}'
                            )
                            response = await agent.send(feedback_prompt)
                    print(f"Response dict: {response_dict}", file=sys.stderr)
                    print(json.dumps(response_dict))
                except Exception as e:
                    # Handle any errors during summarization
                    print(
                        json.dumps(
                            {"error": f"Summarization failed: {str(e)}", "summary": ""}
                        )
                    )
            except json.JSONDecodeError:
                print(json.dumps({"error": "Invalid JSON input", "summary": ""}))
            except Exception as e:
                # Catch any other exceptions
                print(
                    json.dumps({"error": f"Unexpected error: {str(e)}", "summary": ""})
                )
        else:
            # Interactive mode for testing
            await agent.interactive()


if __name__ == "__main__":
    asyncio.run(main())
