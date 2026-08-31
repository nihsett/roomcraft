import { useStore } from '../store';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: object;
  execute: (args: any) => Promise<any>;
}

type ModelContext = {
  registerTool: (tool: object, options?: object) => Promise<void>;
};

export function getModelContext(): ModelContext | null {
  if (typeof document === 'undefined') return null;
  const context = (document as Document & { modelContext?: ModelContext }).modelContext;
  if (!context || typeof context.registerTool !== 'function') return null;
  return context;
}

export function isWebMCPAvailable(): boolean {
  return getModelContext() !== null;
}

export async function registerTool(tool: ToolDef, signal?: AbortSignal): Promise<void> {
  const modelContext = getModelContext();
  if (!modelContext) throw new Error('WebMCP is not available in this browser.');

  const wrappedExecute = async (args: any) => {
    const store = useStore.getState();
    const safeArgs = args && typeof args === 'object' ? args : {};
    try {
      const result = await tool.execute(safeArgs);
      const failed = result && typeof result === 'object' && result.ok === false;
      store.logToolCall({
        name: tool.name,
        args: safeArgs,
        result: failed ? 'error' : 'ok',
        detail: failed ? String(result.error ?? 'Tool returned an error.') : undefined,
      });
      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      store.logToolCall({ name: tool.name, args: safeArgs, result: 'error', detail: message });
      return {
        ok: false,
        error: message,
        state_summary: store.getStateSummary(),
        human_actions_since_last_call: store.getJournalDelta(),
      };
    }
  };

  const options: { signal?: AbortSignal } = {};
  if (signal) options.signal = signal;

  await modelContext.registerTool({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    execute: wrappedExecute,
  }, options);
}
