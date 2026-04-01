/**
 * MCP Adapter — Model Context Protocol bridge for Swarm's plugin/tool ecosystem.
 *
 * Wraps the existing plugin registry, agent skills, and external tools into a
 * standard MCP-compatible interface. This lets any MCP client (Claude, other agents,
 * external integrations) discover and invoke Swarm's capabilities uniformly.
 *
 * MCP Spec: tools have a name, description, input schema (JSON Schema), and an
 * execute function. This adapter translates between Swarm's plugin/skill/agent
 * abstractions and that standard contract.
 */

import {
  listPlugins,
  getPlugin,
} from "./plugins/registry";
import type { PluginRegistration } from "./plugins/types";

// ── Dangerous keys that must never pass through from external params ─────────
const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Strip prototype-pollution keys from an object */
function sanitizeParams(params: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const key of Object.keys(params)) {
    if (!PROTO_KEYS.has(key)) {
      clean[key] = params[key];
    }
  }
  return clean;
}

/** Safe JSON.stringify that handles circular refs and BigInt */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, val) =>
      typeof val === "bigint" ? val.toString() : val,
    );
  } catch {
    return JSON.stringify({ error: "Result contains non-serializable data" });
  }
}

// ── MCP Types ────────────────────────────────────────────────────────────────

export interface MCPToolDefinition {
  /** Unique tool name (namespace.action format) */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for the tool's input parameters */
  inputSchema: Record<string, unknown>;
  /** Category for grouping in tool discovery */
  category: "plugin" | "agent" | "skill" | "workflow" | "custom";
  /** Whether this tool is currently available */
  available: boolean;
}

export interface MCPToolResult {
  /** Whether the tool executed successfully */
  success: boolean;
  /** Result data */
  data?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution time in ms */
  durationMs: number;
}

export type MCPToolHandler = (
  params: Record<string, unknown>,
  context: MCPExecutionContext,
) => Promise<MCPToolResult>;

export interface MCPExecutionContext {
  /** Calling agent or user ID */
  callerId: string;
  /** Organization ID */
  orgId: string;
  /** Optional conversation/session ID */
  sessionId?: string;
  /** Request timeout in ms */
  timeoutMs?: number;
}

interface RegisteredTool {
  definition: MCPToolDefinition;
  handler: MCPToolHandler;
}

// ── MCP Adapter ──────────────────────────────────────────────────────────────

export class MCPAdapter {
  private tools = new Map<string, RegisteredTool>();

  constructor() {
    // Auto-register built-in plugin tools on construction
    this.registerPluginTools();
  }

  // ── Tool Registration ──────────────────────────────────────────────────

  /**
   * Register a custom tool with the MCP adapter.
   * Logs a warning if overwriting an existing tool.
   */
  registerTool(
    definition: MCPToolDefinition,
    handler: MCPToolHandler,
  ): void {
    if (this.tools.has(definition.name)) {
      console.warn(`[MCP] Overwriting existing tool: ${definition.name}`);
    }
    this.tools.set(definition.name, { definition, handler });
  }

  /**
   * Remove a tool by name.
   */
  unregisterTool(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Register an agent as a callable tool (agents-as-tools pattern).
   * This is the key swarms-style feature: any agent becomes invocable
   * as a tool by other agents.
   */
  registerAgentAsTool(opts: {
    agentId: string;
    agentName: string;
    description: string;
    skills: string[];
    invoke: (prompt: string, context: MCPExecutionContext) => Promise<string>;
  }): void {
    const toolName = `agent.${opts.agentId}`;

    this.registerTool(
      {
        name: toolName,
        description: `Agent: ${opts.agentName} — ${opts.description}. Skills: ${opts.skills.join(", ")}`,
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "The task or question to send to this agent",
            },
            context: {
              type: "object",
              description: "Optional context data to include",
              additionalProperties: true,
            },
          },
          required: ["prompt"],
        },
        category: "agent",
        available: true,
      },
      async (params, context) => {
        const start = Date.now();
        // Validate required param
        if (typeof params.prompt !== "string" || !params.prompt.trim()) {
          return {
            success: false,
            error: "Missing or invalid 'prompt' parameter (must be a non-empty string)",
            durationMs: Date.now() - start,
          };
        }
        try {
          const result = await opts.invoke(params.prompt, context);
          return {
            success: true,
            data: { response: result, agentId: opts.agentId },
            durationMs: Date.now() - start,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Agent invocation failed",
            durationMs: Date.now() - start,
          };
        }
      },
    );
  }

  /**
   * Register a workflow as a callable tool.
   */
  registerWorkflowAsTool(opts: {
    workflowId: string;
    workflowName: string;
    description: string;
    inputSchema: Record<string, unknown>;
    startRun: (
      input: Record<string, unknown>,
      context: MCPExecutionContext,
    ) => Promise<string>;
  }): void {
    this.registerTool(
      {
        name: `workflow.${opts.workflowId}`,
        description: `Workflow: ${opts.workflowName} — ${opts.description}`,
        inputSchema: opts.inputSchema,
        category: "workflow",
        available: true,
      },
      async (params, context) => {
        const start = Date.now();
        try {
          const runId = await opts.startRun(params, context);
          return {
            success: true,
            data: { runId, workflowId: opts.workflowId },
            durationMs: Date.now() - start,
          };
        } catch (err) {
          return {
            success: false,
            error: err instanceof Error ? err.message : "Workflow start failed",
            durationMs: Date.now() - start,
          };
        }
      },
    );
  }

  // ── Tool Discovery (MCP list_tools) ────────────────────────────────────

  /**
   * List all available tools — implements MCP's list_tools.
   */
  listTools(opts?: {
    category?: MCPToolDefinition["category"];
    availableOnly?: boolean;
  }): MCPToolDefinition[] {
    let tools = Array.from(this.tools.values()).map((t) => t.definition);

    if (opts?.category) {
      tools = tools.filter((t) => t.category === opts.category);
    }
    if (opts?.availableOnly) {
      tools = tools.filter((t) => t.available);
    }

    return tools;
  }

  /**
   * Get a specific tool definition.
   */
  getTool(name: string): MCPToolDefinition | null {
    return this.tools.get(name)?.definition ?? null;
  }

  // ── Tool Execution (MCP call_tool) ─────────────────────────────────────

  /**
   * Execute a tool by name — implements MCP's call_tool.
   */
  async executeTool(
    name: string,
    params: Record<string, unknown>,
    context: MCPExecutionContext,
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
        durationMs: 0,
      };
    }

    if (!tool.definition.available) {
      return {
        success: false,
        error: `Tool not available: ${name}`,
        durationMs: 0,
      };
    }

    // Sanitize params to prevent prototype pollution
    const safeParams = sanitizeParams(params);

    const timeoutMs = context.timeoutMs || 30000;
    const start = Date.now();

    try {
      // Use AbortController-style timeout to avoid timer leaks
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<MCPToolResult>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Tool timeout after ${timeoutMs}ms`)), timeoutMs);
      });

      try {
        const result = await Promise.race([
          tool.handler(safeParams, context),
          timeoutPromise,
        ]);
        return result;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
        durationMs: Date.now() - start,
      };
    }
  }

  // ── Plugin Bridge ──────────────────────────────────────────────────────

  /**
   * Automatically register all configured plugins as MCP tools.
   */
  private registerPluginTools(): void {
    let registrations: PluginRegistration[];
    try {
      registrations = listPlugins();
    } catch (err) {
      console.warn("[MCP] Plugin registry unavailable:", err instanceof Error ? err.message : err);
      return;
    }

    for (const reg of registrations) {
      const plugin = reg.plugin;
      const isConfigured = plugin.isConfigured();

      this.registerTool(
        {
          name: `plugin.${plugin.id}`,
          description: `${plugin.name} — ${reg.description}. Capabilities: ${plugin.capabilities.join(", ")}`,
          inputSchema: {
            type: "object",
            properties: {
              assetKind: {
                type: "string",
                enum: plugin.capabilities,
                description: "Type of asset to generate",
              },
              prompt: {
                type: "string",
                description: "Generation prompt",
              },
              config: {
                type: "object",
                description: "Plugin-specific configuration",
                additionalProperties: true,
              },
            },
            required: ["assetKind", "prompt"],
          },
          category: "plugin",
          available: isConfigured,
        },
        async (params, _context) => {
          const start = Date.now();
          if (!plugin.isConfigured()) {
            return {
              success: false,
              error: `Plugin ${plugin.id} is not configured (missing env vars: ${plugin.requiredEnvVars.join(", ")})`,
              durationMs: Date.now() - start,
            };
          }

          // Build initial job steps
          const steps = plugin.buildSteps(
            params.assetKind as Parameters<typeof plugin.buildSteps>[0],
            params.config as Record<string, unknown> | undefined,
          );

          return {
            success: true,
            data: {
              pluginId: plugin.id,
              assetKind: params.assetKind,
              steps: steps.map((s: { name: string }) => s.name),
              message: `Job prepared with ${steps.length} steps. Use the workflow engine to execute.`,
            },
            durationMs: Date.now() - start,
          };
        },
      );
    }
  }

  /**
   * Refresh plugin tool availability (call after env changes).
   */
  refreshPluginAvailability(): void {
    for (const [name, tool] of this.tools) {
      if (tool.definition.category === "plugin") {
        const pluginId = name.replace("plugin.", "");
        const plugin = getPlugin(pluginId);
        if (plugin) {
          tool.definition.available = plugin.isConfigured();
        }
      }
    }
  }

  // ── MCP Protocol Serialization ─────────────────────────────────────────

  /**
   * Serialize tool list to MCP wire format.
   */
  toMCPListResponse(): {
    tools: Array<{
      name: string;
      description: string;
      input_schema: Record<string, unknown>;
    }>;
  } {
    const available = this.listTools({ availableOnly: true });
    return {
      tools: available.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    };
  }

  /**
   * Handle an MCP call_tool request.
   */
  async handleMCPCall(request: {
    name: string;
    arguments?: Record<string, unknown>;
    _meta?: { callerId?: string; orgId?: string; sessionId?: string };
  }): Promise<{
    content: Array<{ type: "text"; text: string }>;
    isError?: boolean;
  }> {
    const context: MCPExecutionContext = {
      callerId: request._meta?.callerId || "unknown",
      orgId: request._meta?.orgId || "unknown",
      sessionId: request._meta?.sessionId,
    };

    const result = await this.executeTool(
      request.name,
      request.arguments || {},
      context,
    );

    return {
      content: [
        {
          type: "text",
          text: safeStringify(
            result.success ? result.data : { error: result.error },
          ),
        },
      ],
      isError: !result.success,
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

let _adapter: MCPAdapter | null = null;

/** Module-level lock to prevent double-init race */
let _initializing = false;

export function getMCPAdapter(): MCPAdapter {
  if (!_adapter) {
    if (_initializing) {
      // Re-entrant call during construction — return partial instance
      _adapter = new MCPAdapter();
      _initializing = false;
      return _adapter;
    }
    _initializing = true;
    _adapter = new MCPAdapter();
    _initializing = false;
  }
  return _adapter;
}
