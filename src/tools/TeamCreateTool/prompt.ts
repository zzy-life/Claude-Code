export function getPrompt(): string {
  return `
# TeamCreate

## Authorization Boundary

A team is an opt-in, persistent coordination mechanism. Do NOT create one unless either:

1. The user explicitly asks for a team, swarm, or coordinated group of agents; or
2. Before substantive execution begins, you use AskUserQuestion to propose a team and the user explicitly selects the team option.

You may proactively propose a team only once, at the beginning of the current task. Substantive execution begins when you edit or write files, run implementation or test commands, create and start tasks, or launch an Agent. After that point, do not propose or create a team unless the user explicitly asks for one.

## When to Use

After authorization, use a team only when the work requires persistent coordination between multiple agents, such as:
- Agents must communicate directly with each other
- Agents share task ownership or need dynamic reassignment
- Work must be handed off between agents across multiple turns
- Dependencies between agents cannot be managed as independent, one-shot Agent calls

## When NOT to Use

Do not propose or create a team merely because:
- A task is large, complex, or has multiple steps
- Several independent subtasks can run in parallel
- You want research, implementation, review, testing, or a second opinion
- One or more independent Agent calls can report their results directly to you

Use independent Agent calls by default. When uncertain, do not create a team.

## Asking for Authorization

Only ask when you have identified a concrete need for cross-agent coordination. Present independent agents as the recommended default and explain that a team adds shared tasks, direct messaging, and lifecycle management. Do not ask for routine, bounded, or merely parallel work.

## Sequencing Barrier

TeamCreate is a strict sequencing barrier. Call it separately and wait for its successful result before creating shared tasks or spawning teammates. Never include TeamCreate and Agent calls in the same assistant message or parallel tool batch.

Create a team and its shared task list. The successful tool result provides the active-team operating contract; follow it for the team's lifetime.
`.trim()
}

export function getActiveTeamContract(): string {
  return `
# Active Team Contract

Follow this contract until the active team is deleted:

1. Create shared work with TaskCreate, assign owners with TaskUpdate, and mark tasks completed as soon as they finish.
2. Spawn teammates with Agent using \`team_name\` and \`name\`. Match \`subagent_type\` to the tools the work requires; never assign write work to a read-only agent.
3. Communicate with teammates through SendMessage. Plain assistant text is not delivered to them, and incoming teammate messages arrive automatically without polling.
4. Treat idle as waiting, not terminated. Idle teammates can receive more work or messages.
5. Refer to teammates by name for messaging and task ownership. Use TaskList to coordinate available and blocked work.
6. When work is complete, send each teammate a \`shutdown_request\`, wait for removal from the roster, then call TeamDelete. TeamDelete cannot remove a team while non-leader members remain registered.
7. If team creation or teammate spawning fails, stop and report the original error. Do not retry TeamCreate or spawn replacement teammates automatically.
8. Do not emit protocol JSON as assistant text; protocol responses require the corresponding tool call.
`.trim()
}
