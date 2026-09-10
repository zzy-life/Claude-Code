import type { Command } from '../../commands.js'

const team = {
  name: 'team',
  description: 'Enable or disable direct access to Team tools for this session',
  argumentHint: '[on|off|status]',
  supportsNonInteractive: false,
  type: 'local',
  load: () => import('./team.js'),
} satisfies Command

export default team
