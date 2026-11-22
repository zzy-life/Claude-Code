import type { ToolUseBlock } from '@anthropic-ai/sdk/resources';
import { getRemoteSessionUrl } from '../../constants/product.js';
import { OUTPUT_FILE_TAG, STATUS_TAG, SUMMARY_TAG, TASK_ID_TAG, TASK_NOTIFICATION_TAG, TASK_TYPE_TAG, TOOL_USE_ID_TAG } from '../../constants/xml.js';
import type { SDKAssistantMessage, SDKMessage } from '../../entrypoints/agentSdkTypes.js';
import type { SetAppState, Task, TaskContext, TaskStateBase } from '../../Task.js';
import { createTaskStateBase, generateTaskId } from '../../Task.js';
import { TodoWriteTool } from '../../tools/TodoWriteTool/TodoWriteTool.js';
import { type BackgroundRemoteSessionPrecondition, checkBackgroundRemoteSessionEligibility } from '../../utils/background/remote/remoteSession.js';
import { logForDebugging } from '../../utils/debug.js';
import { logError } from '../../utils/log.js';
import { enqueuePendingNotification } from '../../utils/messageQueueManager.js';
import { emitTaskTerminatedSdk } from '../../utils/sdkEventQueue.js';
import { deleteRemoteAgentMetadata, listRemoteAgentMetadata, type RemoteAgentMetadata, writeRemoteAgentMetadata } from '../../utils/sessionStorage.js';
import { jsonStringify } from '../../utils/slowOperations.js';
import { appendTaskOutput, evictTaskOutput, getTaskOutputPath, initTaskOutput } from '../../utils/task/diskOutput.js';
import { registerTask, updateTaskState } from '../../utils/task/framework.js';
import { fetchSession } from '../../utils/teleport/api.js';
import { archiveRemoteSession, pollRemoteSessionEvents } from '../../utils/teleport.js';
import type { TodoList } from '../../utils/todo/types.js';
export type RemoteAgentTaskState = TaskStateBase & {
  type: 'remote_agent';
  remoteTaskType: RemoteTaskType;
  /** Task-specific metadata (PR number, repo, etc.). */
  remoteTaskMetadata?: RemoteTaskMetadata;
  sessionId: string; // Original session ID for API calls
  command: string;
  title: string;
  todoList: TodoList;
  log: SDKMessage[];
  /**
   * Long-running agent that will not be marked as complete after the first `result`.
   */
  isLongRunning?: boolean;
};
const REMOTE_TASK_TYPES = ['remote-agent', 'autofix-pr', 'background-pr'] as const;
export type RemoteTaskType = (typeof REMOTE_TASK_TYPES)[number];
function isRemoteTaskType(v: string | undefined): v is RemoteTaskType {
  return (REMOTE_TASK_TYPES as readonly string[]).includes(v ?? '');
}
export type AutofixPrRemoteTaskMetadata = {
  owner: string;
  repo: string;
  prNumber: number;
};
export type RemoteTaskMetadata = AutofixPrRemoteTaskMetadata;

/**
 * Called on every poll tick for tasks with a matching remoteTaskType. Return a
 * non-null string to complete the task (string becomes the notification text),
 * or null to keep polling. Checkers that hit external APIs should self-throttle.
 */
export type RemoteTaskCompletionChecker = (remoteTaskMetadata: RemoteTaskMetadata | undefined) => Promise<string | null>;
const completionCheckers = new Map<RemoteTaskType, RemoteTaskCompletionChecker>();

/**
 * Register a completion checker for a remote task type. Invoked on every poll
 * tick; survives --resume via the sidecar's remoteTaskType + remoteTaskMetadata.
 */
export function registerCompletionChecker(remoteTaskType: RemoteTaskType, checker: RemoteTaskCompletionChecker): void {
  completionCheckers.set(remoteTaskType, checker);
}

/**
 * Persist a remote-agent metadata entry to the session sidecar.
 * Fire-and-forget — persistence failures must not block task registration.
 */
async function persistRemoteAgentMetadata(meta: RemoteAgentMetadata): Promise<void> {
  try {
    await writeRemoteAgentMetadata(meta.taskId, meta);
  } catch (e) {
    logForDebugging(`persistRemoteAgentMetadata failed: ${String(e)}`);
  }
}

/**
 * Remove a remote-agent metadata entry from the session sidecar.
 * Called on task completion/kill so restored sessions don't resurrect
 * tasks that already finished.
 */
async function removeRemoteAgentMetadata(taskId: string): Promise<void> {
  try {
    await deleteRemoteAgentMetadata(taskId);
  } catch (e) {
    logForDebugging(`removeRemoteAgentMetadata failed: ${String(e)}`);
  }
}

// Precondition error result
export type RemoteAgentPreconditionResult = {
  eligible: true;
} | {
  eligible: false;
  errors: BackgroundRemoteSessionPrecondition[];
};

/**
 * Check eligibility for creating a remote agent session.
 */
export async function checkRemoteAgentEligibility({
  skipBundle = false
}: {
  skipBundle?: boolean;
} = {}): Promise<RemoteAgentPreconditionResult> {
  const errors = await checkBackgroundRemoteSessionEligibility({
    skipBundle
  });
  if (errors.length > 0) {
    return {
      eligible: false,
      errors
    };
  }
  return {
    eligible: true
  };
}

/**
 * Format precondition error for display.
 */
export function formatPreconditionError(error: BackgroundRemoteSessionPrecondition): string {
  switch (error.type) {
    case 'not_logged_in':
      return 'Please run /login and sign in with your Claude.ai account (not Console).';
    case 'no_remote_environment':
      return 'No cloud environment available. Set one up at https://claude.ai/code/onboarding?magic=env-setup';
    case 'not_in_git_repo':
      return 'Background tasks require a git repository. Initialize git or run from a git repository.';
    case 'no_git_remote':
      return 'Background tasks require a GitHub remote. Add one with `git remote add origin REPO_URL`.';
    case 'github_app_not_installed':
      return 'The Claude GitHub app must be installed on this repository first.\nhttps://github.com/apps/claude/installations/new';
    case 'policy_blocked':
      return "Remote sessions are disabled by your organization's policy. Contact your organization admin to enable them.";
  }
}

/**
 * Enqueue a remote task notification to the message queue.
 */
function enqueueRemoteNotification(taskId: string, title: string, status: 'completed' | 'failed' | 'killed', setAppState: SetAppState, toolUseId?: string): void {
  // Atomically check and set notified flag to prevent duplicate notifications.
  if (!markTaskNotified(taskId, setAppState)) return;
  const statusText = status === 'completed' ? 'completed successfully' : status === 'failed' ? 'failed' : 'was stopped';
  const toolUseIdLine = toolUseId ? `\n<${TOOL_USE_ID_TAG}>${toolUseId}</${TOOL_USE_ID_TAG}>` : '';
  const outputPath = getTaskOutputPath(taskId);
  const message = `<${TASK_NOTIFICATION_TAG}>
<${TASK_ID_TAG}>${taskId}</${TASK_ID_TAG}>${toolUseIdLine}
<${TASK_TYPE_TAG}>remote_agent</${TASK_TYPE_TAG}>
<${OUTPUT_FILE_TAG}>${outputPath}</${OUTPUT_FILE_TAG}>
<${STATUS_TAG}>${status}</${STATUS_TAG}>
<${SUMMARY_TAG}>Remote task "${title}" ${statusText}</${SUMMARY_TAG}>
</${TASK_NOTIFICATION_TAG}>`;
  enqueuePendingNotification({
    value: message,
    mode: 'task-notification'
  });
}

/**
 * Atomically mark a task as notified. Returns true if this call flipped the
 * flag (caller should enqueue), false if already notified (caller should skip).
 */
function markTaskNotified(taskId: string, setAppState: SetAppState): boolean {
  let shouldEnqueue = false;
  updateTaskState(taskId, setAppState, task => {
    if (task.notified) {
      return task;
    }
    shouldEnqueue = true;
    return {
      ...task,
      notified: true
    };
  });
  return shouldEnqueue;
}

/**
 * Extract todo list from SDK messages (finds last TodoWrite tool use).
 */
function extractTodoListFromLog(log: SDKMessage[]): TodoList {
  const todoListMessage = log.findLast((msg): msg is SDKAssistantMessage => msg.type === 'assistant' && msg.message.content.some(block => block.type === 'tool_use' && block.name === TodoWriteTool.name));
  if (!todoListMessage) {
    return [];
  }
  const input = todoListMessage.message.content.find((block): block is ToolUseBlock => block.type === 'tool_use' && block.name === TodoWriteTool.name)?.input;
  if (!input) {
    return [];
  }
  const parsedInput = TodoWriteTool.inputSchema.safeParse(input);
  if (!parsedInput.success) {
    return [];
  }
  return parsedInput.data.todos;
}

/**
 * Register a remote agent task in the unified task framework.
 * Bundles task ID generation, output init, state creation, registration, and polling.
 * Callers remain responsible for custom pre-registration logic (git dialogs, transcript upload, teleport options).
 */
export function registerRemoteAgentTask(options: {
  remoteTaskType: RemoteTaskType;
  session: {
    id: string;
    title: string;
  };
  command: string;
  context: TaskContext;
  toolUseId?: string;
  isLongRunning?: boolean;
  remoteTaskMetadata?: RemoteTaskMetadata;
}): {
  taskId: string;
  sessionId: string;
  cleanup: () => void;
} {
  const {
    remoteTaskType,
    session,
    command,
    context,
    toolUseId,
    isLongRunning,
    remoteTaskMetadata
  } = options;
  const taskId = generateTaskId('remote_agent');

  // Create the output file before registering the task.
  // RemoteAgentTask uses appendTaskOutput() (not TaskOutput), so
  // the file must exist for readers before any output arrives.
  void initTaskOutput(taskId);
  const taskState: RemoteAgentTaskState = {
    ...createTaskStateBase(taskId, 'remote_agent', session.title, toolUseId),
    type: 'remote_agent',
    remoteTaskType,
    status: 'running',
    sessionId: session.id,
    command,
    title: session.title,
    todoList: [],
    log: [],
    isLongRunning,
    remoteTaskMetadata
  };
  registerTask(taskState, context.setAppState);

  // Persist identity to the session sidecar so --resume can reconnect to
  // still-running remote sessions. Status is not stored — it's fetched
  // fresh from CCR on restore.
  void persistRemoteAgentMetadata({
    taskId,
    remoteTaskType,
    sessionId: session.id,
    title: session.title,
    command,
    spawnedAt: Date.now(),
    toolUseId,
    isLongRunning,
    remoteTaskMetadata
  });

  const stopPolling = startRemoteSessionPolling(taskId, context);
  return {
    taskId,
    sessionId: session.id,
    cleanup: stopPolling
  };
}

/**
 * Restore remote-agent tasks from the session sidecar on --resume.
 *
 * For remote-agents/ entries, fetches live CCR status, reconstructs
 * RemoteAgentTaskState into AppState.tasks, and restarts polling for sessions
 * still running. Sessions that are archived or 404 have their sidecar file
 * removed. Must run after switchSession() so getSessionId() points at the
 * resumed session's sidecar directory.
 */
export async function restoreRemoteAgentTasks(context: TaskContext): Promise<void> {
  try {
    await restoreRemoteAgentTasksImpl(context);
  } catch (e) {
    logForDebugging(`restoreRemoteAgentTasks failed: ${String(e)}`);
  }
}
async function restoreRemoteAgentTasksImpl(context: TaskContext): Promise<void> {
  const persisted = await listRemoteAgentMetadata();
  if (persisted.length === 0) return;
  for (const meta of persisted) {
    let remoteStatus: string;
    try {
      const session = await fetchSession(meta.sessionId);
      remoteStatus = session.session_status;
    } catch (e) {
      // Only 404 means the CCR session is truly gone. Auth errors (401,
      // missing OAuth token) are recoverable via /login — the remote
      // session is still running. fetchSession throws plain Error for all
      // 4xx (validateStatus treats <500 as success), so isTransientNetworkError
      // can't distinguish them; match the 404 message instead.
      if (e instanceof Error && e.message.startsWith('Session not found:')) {
        logForDebugging(`restoreRemoteAgentTasks: dropping ${meta.taskId} (404: ${String(e)})`);
        void removeRemoteAgentMetadata(meta.taskId);
      } else {
        logForDebugging(`restoreRemoteAgentTasks: skipping ${meta.taskId} (recoverable: ${String(e)})`);
      }
      continue;
    }
    if (remoteStatus === 'archived') {
      // Session ended while the local client was offline. Don't resurrect.
      void removeRemoteAgentMetadata(meta.taskId);
      continue;
    }
    const taskState: RemoteAgentTaskState = {
      ...createTaskStateBase(meta.taskId, 'remote_agent', meta.title, meta.toolUseId),
      type: 'remote_agent',
      remoteTaskType: isRemoteTaskType(meta.remoteTaskType) ? meta.remoteTaskType : 'remote-agent',
      status: 'running',
      sessionId: meta.sessionId,
      command: meta.command,
      title: meta.title,
      todoList: [],
      log: [],
      isLongRunning: meta.isLongRunning,
      startTime: meta.spawnedAt,
      remoteTaskMetadata: meta.remoteTaskMetadata as RemoteTaskMetadata | undefined
    };
    registerTask(taskState, context.setAppState);
    void initTaskOutput(meta.taskId);
    startRemoteSessionPolling(meta.taskId, context);
  }
}

/**
 * Start polling for remote session updates.
 * Returns a cleanup function to stop polling.
 */
function startRemoteSessionPolling(taskId: string, context: TaskContext): () => void {
  let isRunning = true;
  const POLL_INTERVAL_MS = 1000;
  let lastEventId: string | null = null;
  let accumulatedLog: SDKMessage[] = [];
  const poll = async (): Promise<void> => {
    if (!isRunning) return;
    try {
      const appState = context.getAppState();
      const task = appState.tasks?.[taskId] as RemoteAgentTaskState | undefined;
      if (!task || task.status !== 'running') {
        // Task was killed externally (TaskStopTool) or already terminal.
        // Stop local tracking here without changing the remote session, so its
        // URL remains available for revisiting output. Explicit task stops
        // archive the session through kill().
        return;
      }
      const response = await pollRemoteSessionEvents(task.sessionId, lastEventId);
      lastEventId = response.lastEventId;
      const logGrew = response.newEvents.length > 0;
      if (logGrew) {
        accumulatedLog = [...accumulatedLog, ...response.newEvents];
        const deltaText = response.newEvents.map(msg => {
          if (msg.type === 'assistant') {
            return msg.message.content.filter(block => block.type === 'text').map(block => 'text' in block ? block.text : '').join('\n');
          }
          return jsonStringify(msg);
        }).join('\n');
        if (deltaText) {
          appendTaskOutput(taskId, deltaText + '\n');
        }
      }
      if (response.sessionStatus === 'archived') {
        updateTaskState<RemoteAgentTaskState>(taskId, context.setAppState, t => t.status === 'running' ? {
          ...t,
          status: 'completed',
          endTime: Date.now()
        } : t);
        enqueueRemoteNotification(taskId, task.title, 'completed', context.setAppState, task.toolUseId);
        void evictTaskOutput(taskId);
        void removeRemoteAgentMetadata(taskId);
        return;
      }
      const checker = completionCheckers.get(task.remoteTaskType);
      if (checker) {
        const completionResult = await checker(task.remoteTaskMetadata);
        if (completionResult !== null) {
          updateTaskState<RemoteAgentTaskState>(taskId, context.setAppState, t => t.status === 'running' ? {
            ...t,
            status: 'completed',
            endTime: Date.now()
          } : t);
          enqueueRemoteNotification(taskId, completionResult, 'completed', context.setAppState, task.toolUseId);
          void evictTaskOutput(taskId);
          void removeRemoteAgentMetadata(taskId);
          return;
        }
      }

      // Long-running monitors (autofix-pr) emit result per notification cycle,
      // so these results must not drive completion.
      const result = task.isLongRunning ? undefined : accumulatedLog.findLast(msg => msg.type === 'result');

      let newStatus: 'completed' | 'failed' | 'running' | 'starting';
      if (result) {
        if (result.subtype === 'success') {
          newStatus = 'completed';
        } else {
          newStatus = 'failed';
        }
      } else if (accumulatedLog.length > 0) {
        newStatus = 'running';
      } else {
        newStatus = 'starting';
      }

      // Update task state. Guard against terminal states — if stopTask raced
      // while pollRemoteSessionEvents was in-flight (status set to 'killed',
      // notified set to true), bail without overwriting status or proceeding to
      // side effects (notification, permission-mode flip).
      let raceTerminated = false;
      updateTaskState<RemoteAgentTaskState>(taskId, context.setAppState, prevTask => {
        if (prevTask.status !== 'running') {
          raceTerminated = true;
          return prevTask;
        }
        // No log growth and status unchanged → nothing to report. Return
        // same ref so updateTaskState skips the spread and 18 s.tasks
        // subscribers (REPL, Spinner, PromptInput, ...) don't re-render.
        const statusUnchanged = newStatus === 'running' || newStatus === 'starting';
        if (!logGrew && statusUnchanged) {
          return prevTask;
        }
        return {
          ...prevTask,
          status: newStatus === 'starting' ? 'running' : newStatus,
          log: accumulatedLog,
          // Only re-scan for TodoWrite when log grew — log is append-only,
          // so no growth means no new tool_use blocks. Avoids findLast +
          // some + find + safeParse every second when idle.
          todoList: logGrew ? extractTodoListFromLog(accumulatedLog) : prevTask.todoList,
          endTime: result ? Date.now() : undefined
        };
      });
      if (raceTerminated) return;

      // Send notification when the remote task returns a result.
      if (result) {
        const finalStatus = result.subtype !== 'success' ? 'failed' : 'completed';

        enqueueRemoteNotification(taskId, task.title, finalStatus, context.setAppState, task.toolUseId);
        void evictTaskOutput(taskId);
        void removeRemoteAgentMetadata(taskId);
        return; // Stop polling
      }
    } catch (error) {
      logError(error);
    }

    // Continue polling
    if (isRunning) {
      setTimeout(poll, POLL_INTERVAL_MS);
    }
  };

  // Start polling
  void poll();

  // Return cleanup function
  return () => {
    isRunning = false;
  };
}

/**
 * RemoteAgentTask - Handles remote Claude.ai session execution.
 *
 * Replaces the BackgroundRemoteSession implementation from:
 * - src/utils/background/remote/remoteSession.ts
 * - src/components/tasks/BackgroundTaskStatus.tsx (polling logic)
 */
export const RemoteAgentTask: Task = {
  name: 'RemoteAgentTask',
  type: 'remote_agent',
  async kill(taskId, setAppState) {
    let toolUseId: string | undefined;
    let description: string | undefined;
    let sessionId: string | undefined;
    let killed = false;
    updateTaskState<RemoteAgentTaskState>(taskId, setAppState, task => {
      if (task.status !== 'running') {
        return task;
      }
      toolUseId = task.toolUseId;
      description = task.description;
      sessionId = task.sessionId;
      killed = true;
      return {
        ...task,
        status: 'killed',
        notified: true,
        endTime: Date.now()
      };
    });

    // Close the task_started bookend for SDK consumers. The poll loop's
    // early-return when status!=='running' won't emit a notification.
    if (killed) {
      emitTaskTerminatedSdk(taskId, 'stopped', {
        toolUseId,
        summary: description
      });
      // Archive the remote session so it stops consuming cloud resources.
      if (sessionId) {
        void archiveRemoteSession(sessionId).catch(e => logForDebugging(`RemoteAgentTask archive failed: ${String(e)}`));
      }
    }
    void evictTaskOutput(taskId);
    void removeRemoteAgentMetadata(taskId);
    logForDebugging(`RemoteAgentTask ${taskId} killed, archiving session ${sessionId ?? 'unknown'}`);
  }
};

/**
 * Get the session URL for a remote task.
 */
export function getRemoteTaskSessionUrl(sessionId: string): string {
  return getRemoteSessionUrl(sessionId, process.env.SESSION_INGRESS_URL);
}