import type { LocalCommandCall } from '../../types/command.js'
import {
  isTeamToolsModeEnabled,
  setTeamToolsModeEnabled,
} from '../../utils/teamToolsMode.js'

export const call: LocalCommandCall = async args => {
  const action = args.trim().toLowerCase() || 'on'

  if (action === 'status') {
    return {
      type: 'text',
      value: `Team tools direct access is ${isTeamToolsModeEnabled() ? 'ON' : 'OFF'}.`,
    }
  }

  if (action !== 'on' && action !== 'off') {
    return {
      type: 'text',
      value: 'Usage: /team [on|off|status]',
    }
  }

  const enabled = action === 'on'
  setTeamToolsModeEnabled(enabled)

  return {
    type: 'text',
    value: enabled
      ? 'Team mode ON for this session. TeamCreate and TeamDelete are now directly available; using /team is explicit authorization to create a team.'
      : 'Team mode OFF. TeamCreate and TeamDelete are no longer exposed.',
  }
}
