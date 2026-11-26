// Interface neutra entre o motor da assistente e cada provedor de IA.

export type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
export type ToolCall = { id: string; name: string; input: Record<string, unknown> };
export type ToolResult = { id: string; content: string; isError?: boolean };
export type HistoryItem = { role: "user" | "assistant"; text: string };

export type StepResult = {
  toolCalls: ToolCall[];
  text: string;
  refused: boolean;
  pause: boolean;
  /** Modelo que efetivamente respondeu (pode diferir em fallback). */
  servedModel: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

/** Transcript é sempre o formato nativo do provedor, guardado como JSON e só acrescentado. */
export interface ChatProvider {
  kind: string;
  configured(): boolean;
  rebuild(history: HistoryItem[]): unknown[];
  addUser(transcript: unknown[], texts: string[]): void;
  step(args: { model: string; system: string; tools: ToolDef[]; transcript: unknown[] }): Promise<StepResult>;
  addToolResults(transcript: unknown[], results: ToolResult[]): void;
}
