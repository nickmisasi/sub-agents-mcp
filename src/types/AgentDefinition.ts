/**
 * Represents an AI agent definition loaded from a markdown file.
 * This interface defines the structure for Claude Code sub-agent format files
 * that contain agent instructions and metadata.
 */
export interface AgentDefinition {
  /**
   * The unique name identifier of the agent.
   * Used as the key for agent selection and execution.
   */
  name: string

  /**
   * Human-readable description of what the agent does.
   * Provides context about the agent's purpose and capabilities.
   */
  description: string

  /**
   * The full content/instructions for the agent.
   * Contains the markdown content with agent directives and examples.
   */
  content: string

  /**
   * Absolute file path where the agent definition is stored.
   * Used for file watching and cache invalidation.
   */
  filePath: string

  /**
   * Timestamp when the agent definition file was last modified.
   * Used for cache invalidation and version tracking.
   */
  lastModified: Date

  /**
   * The AI model to use for this agent (e.g., "sonnet", "opus").
   * Optional field from Claude Code format frontmatter.
   */
  model?: string

  /**
   * Color identifier for the agent in the UI.
   * Optional field from Claude Code format frontmatter.
   */
  color?: string

  /**
   * List of tools available to the agent.
   * Optional field from Claude Code format frontmatter.
   */
  tools?: string[]

  /**
   * Whether to enable auto-approval mode for tools and permissions.
   * Maps to --dangerously-skip-permissions (Claude), --approval-mode yolo (Gemini), or -f (Cursor).
   */
  autoApprovalMode?: boolean

  /**
   * Type of agent to use for execution (e.g., "cursor", "claude", "gemini").
   * Optional field that overrides the server's default agentType.
   * If not specified, falls back to server configuration.
   */
  agentType?: 'cursor' | 'claude' | 'gemini'
}
