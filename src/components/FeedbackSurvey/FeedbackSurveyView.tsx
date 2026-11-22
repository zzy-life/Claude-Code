// Shared with SkillImprovementSurvey; keep this validation independent of UI.
const RESPONSE_INPUTS = ['0', '1', '2', '3'] as const
type ResponseInput = (typeof RESPONSE_INPUTS)[number]

export const isValidResponseInput = (input: string): input is ResponseInput =>
  (RESPONSE_INPUTS as readonly string[]).includes(input)
