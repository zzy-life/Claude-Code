import { findToolByName, type Tool, type Tools } from '../Tool.js'
import { AgentTool } from '../tools/AgentTool/AgentTool.js'
import { BashTool } from '../tools/BashTool/BashTool.js'
import { FileEditTool } from '../tools/FileEditTool/FileEditTool.js'
import { FileReadTool } from '../tools/FileReadTool/FileReadTool.js'
import { FileWriteTool } from '../tools/FileWriteTool/FileWriteTool.js'
import { GlobTool } from '../tools/GlobTool/GlobTool.js'
import { GrepTool } from '../tools/GrepTool/GrepTool.js'
import { NotebookEditTool } from '../tools/NotebookEditTool/NotebookEditTool.js'

let displayTools: Tools | undefined

// Historical display must survive tool filtering; never use this fallback for execution.
export function findToolForDisplay(
  tools: Tools,
  name: string,
): Tool | undefined {
  const tool = findToolByName(tools, name)
  if (tool) {
    return tool
  }

  // Tool imports form cycles, so defer reading their bindings until call time.
  if (!displayTools) {
    displayTools = [
      FileReadTool,
      FileWriteTool,
      FileEditTool,
      GlobTool,
      GrepTool,
      BashTool,
      NotebookEditTool,
      AgentTool,
    ]
  }

  return findToolByName(displayTools, name)
}
