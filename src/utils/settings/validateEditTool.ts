import type { ValidationResult } from 'src/Tool.js'
import { isClaudeSettingsPath } from '../permissions/filesystem.js'
import { validateSettingsFileContent } from './validation.js'

/**
 * Validates settings file edits to ensure the result conforms to SettingsSchema.
 * This is used by FileEditTool to avoid code duplication.
 *
 * @param filePath - The file path being edited
 * @param originalContent - The original file content before edits
 * @param getUpdatedContent - A closure that returns the content after applying edits
 * @returns Validation result with error details if validation fails
 */
export function validateInputForSettingsFileEdit(
  filePath: string,
  originalContent: string,
  getUpdatedContent: () => string,
): Extract<ValidationResult, { result: false }> | null {
  // Only validate Claude settings files
  if (!isClaudeSettingsPath(filePath)) {
    return null
  }

  // Check if the current file (before edit) conforms to the schema
  const beforeValidation = validateSettingsFileContent(originalContent)

  let allowedUnknownKeys: string[] = []
  if (beforeValidation.isValid === false) {
    allowedUnknownKeys = beforeValidation.unknownKeys ?? []
    // Retired keys must not disable validation of otherwise valid settings.
    if (!beforeValidation.onlyUnknownKeys) {
      return null
    }
  }

  const updatedContent = getUpdatedContent()
  const afterValidation = validateSettingsFileContent(
    updatedContent,
    allowedUnknownKeys,
  )

  if (afterValidation.isValid === false) {
    return {
      result: false,
      message: `Claude Code settings.json validation failed after edit:\n${afterValidation.error}\n\nFull schema:\n${afterValidation.fullSchema}\nIMPORTANT: Do not update the env unless explicitly instructed to do so.`,
      errorCode: 10,
    }
  }

  return null
}
