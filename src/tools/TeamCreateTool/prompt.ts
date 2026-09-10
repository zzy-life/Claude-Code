export function getPrompt(): string {
  return `
# TeamCreate

## Authorization Boundary

This tool is exposed only after the user runs "/team". Running that command is explicit authorization to create and use a team in the current session; do not ask for authorization again.

## When to Use

Use a team when the work requires persistent coordination between multiple agents, such as:
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
