export function getPrompt(): string {
  return `
# TeamDelete

Remove team and task directories when the swarm work is complete.

This operation:
- Removes the team directory (\`~/.claude/teams/{team-name}/\`)
- Removes the task directory (\`~/.claude/tasks/{team-name}/\`)
- Clears team context from the current session

**IMPORTANT**: TeamDelete will fail while any non-leader member remains registered, including idle members. Gracefully shut them down or explicitly kill them first, then call TeamDelete after they have been removed from the team.

Use this when all teammates have finished their work and you want to clean up the team resources. The team name is automatically determined from the current session's team context.
`.trim()
}
