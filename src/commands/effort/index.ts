import type { Command } from '../../commands.js'

export default {
  type: 'local-jsx',
  name: 'effort',
  description: 'Set effort level for model usage',
  argumentHint: '[low|medium|high|max|auto]',
  load: () => import('./effort.js'),
} satisfies Command
