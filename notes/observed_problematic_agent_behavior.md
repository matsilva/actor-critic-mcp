A running list of historic issues I (Mat Silv) have observed while using codeloops with coding agents(as actors)

- coding agent would abuse `needsMore` input param for the actor_think tool, setting it to true to avoid having to deal with critic feedback, effectively sidestepping it.
- coding agent will ignore codebase rulesets, ie: 'always collocate types, do not seperate them'
- coding agent wil claim dead code removal falsely
- coding agent could not consistently reason about or use `branchLabel` feature, allowing the agent to work in branches for tasks. Similar issue to `needsMore`
