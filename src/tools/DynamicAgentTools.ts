/**
 * DynamicAgentTools implementation for exposing each agent as its own MCP tool
 *
 * Provides dynamic tool creation where each agent becomes a separate MCP tool
 * with standardized parameters and automatic output instruction integration.
 */

import type { AgentManager } from 'src/agents/AgentManager'
import type { AgentExecutionResult, AgentExecutor } from 'src/execution/AgentExecutor'
import type { ExecutionParams } from 'src/types/ExecutionParams'
import { type LogLevel, Logger } from 'src/utils/Logger'

/**
 * Default output instructions applied to all agent executions
 */
const DEFAULT_OUTPUT_INSTRUCTIONS =
  'Provide a brief summary of what you accomplished or failed to do, ' +
  'and suggest potential next steps if necessary.'

/**
 * MCP tool content type for text responses
 */
interface McpTextContent {
  type: 'text'
  text: string
}

/**
 * MCP tool response format
 */
interface McpToolResponse {
  content: McpTextContent[]
  isError?: boolean
  structuredContent?: unknown
}

/**
 * Input schema for dynamic agent tool parameters
 */
interface DynamicAgentInputSchema {
  [x: string]: unknown
  type: 'object'
  properties: {
    [x: string]: unknown
    prompt: {
      type: 'string'
      description: string
    }
    output_instructions: {
      type: 'string'
      description: string
    }
    cwd: {
      type: 'string'
      description: string
    }
    extra_args: {
      type: 'array'
      items: { type: 'string' }
      description: string
    }
  }
  required: string[]
}

/**
 * Parameters for dynamic agent tool execution
 */
interface DynamicAgentParams {
  prompt: string
  output_instructions?: string | undefined
  cwd?: string | undefined
  extra_args?: string[] | undefined
}

/**
 * DynamicAgentTool class representing a single agent as an MCP tool
 *
 * Each instance represents one agent and provides execution with
 * standardized parameters and output instruction integration.
 */
export class DynamicAgentTool {
  public readonly name: string
  public readonly description: string
  public readonly inputSchema: DynamicAgentInputSchema
  private logger: Logger
  private executionStats: { count: number; totalTime: number; lastUsed: Date } = {
    count: 0,
    totalTime: 0,
    lastUsed: new Date(),
  }

  constructor(
    private agentName: string,
    agentDescription: string,
    private agentExecutor: AgentExecutor,
    private agentManager: AgentManager
  ) {
    this.name = DynamicAgentTool.sanitizeToolName(agentName)
    this.description = agentDescription

    this.inputSchema = {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Task description or instructions for the agent to execute',
        },
        output_instructions: {
          type: 'string',
          description: `Optional instructions for formatting the agent's response (default: "${DEFAULT_OUTPUT_INSTRUCTIONS}")`,
        },
        cwd: {
          type: 'string',
          description: 'Working directory path for agent execution context (optional)',
        },
        extra_args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Additional configuration parameters for agent execution (optional)',
        },
      },
      required: ['prompt'],
    }

    const logLevel = (process.env['LOG_LEVEL'] as LogLevel) || 'info'
    this.logger = new Logger(logLevel)
  }

  /**
   * Sanitize agent name to create valid MCP tool name
   *
   * @param agentName - Original agent name
   * @returns Sanitized tool name with agent_ prefix
   */
  static sanitizeToolName(agentName: string): string {
    // Prefix with agent_ and ensure valid characters
    return `agent_${agentName.replace(/[^a-zA-Z0-9_-]/g, '_')}`
  }

  /**
   * Execute the dynamic agent tool with the provided parameters
   *
   * @param params - Tool execution parameters
   * @returns Promise resolving to MCP tool response
   * @throws {Error} When parameters are invalid or execution fails
   */
  async execute(params: unknown): Promise<McpToolResponse> {
    const startTime = Date.now()
    const requestId = this.generateRequestId()

    this.logger.info('Dynamic agent tool execution started', {
      requestId,
      toolName: this.name,
      agentName: this.agentName,
      timestamp: new Date().toISOString(),
    })

    try {
      // Validate parameters
      const validatedParams = this.validateParams(params)

      this.logger.debug('Parameters validated successfully', {
        requestId,
        promptLength: validatedParams.prompt.length,
        hasOutputInstructions: !!validatedParams.output_instructions,
        cwd: validatedParams.cwd,
        extraArgsCount: validatedParams.extra_args?.length || 0,
      })

      // Get agent definition
      const agent = await this.agentManager.getAgent(this.agentName)
      if (!agent) {
        throw new Error(`Agent '${this.agentName}' not found`)
      }

      // Apply output instructions (use default if not provided)
      const outputInstructions = validatedParams.output_instructions || DEFAULT_OUTPUT_INSTRUCTIONS
      const finalPrompt = `${validatedParams.prompt}\n\n[Output Instructions]\n${outputInstructions}`

      this.logger.debug('Prompt prepared with output instructions', {
        requestId,
        finalPromptLength: finalPrompt.length,
        usedDefaultInstructions: !validatedParams.output_instructions,
      })

      // Prepare execution parameters
      const executionParams: ExecutionParams = {
        agent: agent.content,
        prompt: finalPrompt,
        ...(validatedParams.cwd !== undefined && { cwd: validatedParams.cwd }),
        ...(validatedParams.extra_args !== undefined && {
          extra_args: validatedParams.extra_args,
        }),
        ...(agent.agentType && { agentType: agent.agentType }),
        ...(agent.model && { model: agent.model }),
      }

      // Execute agent
      const result = await this.agentExecutor.executeAgent(executionParams)

      // Update execution statistics
      this.updateExecutionStats(result.executionTime)

      this.logger.info('Dynamic agent tool execution completed successfully', {
        requestId,
        toolName: this.name,
        agentName: this.agentName,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        totalTime: Date.now() - startTime,
      })

      return this.formatExecutionResponse(result, requestId, agent.agentType, agent.model)
    } catch (error) {
      const totalTime = Date.now() - startTime

      this.logger.error(
        'Dynamic agent tool execution failed',
        error instanceof Error ? error : undefined,
        {
          requestId,
          toolName: this.name,
          agentName: this.agentName,
          totalTime,
          errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        }
      )

      return this.createErrorResponse(
        `Agent execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Validate and type-check the input parameters
   *
   * @private
   * @param params - Raw parameters to validate
   * @returns Validated parameters
   * @throws {Error} When parameters are invalid
   */
  private validateParams(params: unknown): DynamicAgentParams {
    if (!params || typeof params !== 'object') {
      throw new Error('Invalid parameters: expected object')
    }

    const p = params as Record<string, unknown>

    // Validate required prompt parameter
    if (!p['prompt'] || typeof p['prompt'] !== 'string') {
      throw new Error('Prompt parameter is required and must be a string')
    }

    const prompt = p['prompt'].trim()
    if (prompt === '') {
      throw new Error('Invalid prompt parameter: cannot be empty')
    }

    if (prompt.length > 50000) {
      throw new Error('Prompt too long (max 50,000 characters)')
    }

    // Validate optional output_instructions parameter
    if (p['output_instructions'] !== undefined) {
      if (typeof p['output_instructions'] !== 'string') {
        throw new Error('output_instructions parameter must be a string if provided')
      }

      if (p['output_instructions'].length > 5000) {
        throw new Error('output_instructions too long (max 5,000 characters)')
      }
    }

    // Validate optional cwd parameter
    if (p['cwd'] !== undefined) {
      if (typeof p['cwd'] !== 'string') {
        throw new Error('CWD parameter must be a string if provided')
      }

      if (p['cwd'].length > 1000) {
        throw new Error('Working directory path too long (max 1000 characters)')
      }

      // Basic path security check
      if (p['cwd'].includes('..') || p['cwd'].includes('\0')) {
        throw new Error('Invalid working directory path')
      }
    }

    // Validate optional extra_args parameter
    if (p['extra_args'] !== undefined) {
      if (!Array.isArray(p['extra_args'])) {
        throw new Error('Extra args parameter must be an array if provided')
      }

      if (p['extra_args'].length > 20) {
        throw new Error('Too many extra arguments (max 20 allowed)')
      }

      for (const [index, arg] of p['extra_args'].entries()) {
        if (typeof arg !== 'string') {
          throw new Error(`Extra argument at index ${index} must be a string`)
        }

        if (arg.length > 1000) {
          throw new Error(`Extra argument at index ${index} too long (max 1000 characters)`)
        }
      }
    }

    return {
      prompt: prompt,
      output_instructions: p['output_instructions'] as string | undefined,
      cwd: p['cwd'] as string | undefined,
      extra_args: p['extra_args'] as string[] | undefined,
    }
  }

  /**
   * Format agent execution response
   *
   * @private
   * @param result - Agent execution result
   * @param requestId - Request tracking ID
   * @param agentType - Optional agent type used
   * @param model - Optional model used
   * @returns Formatted MCP response
   */
  private formatExecutionResponse(
    result: AgentExecutionResult,
    requestId?: string,
    agentType?: 'cursor' | 'claude',
    model?: string
  ): McpToolResponse {
    // Determine execution status
    const isSuccess =
      result.exitCode === 0 || // Normal completion
      (result.exitCode === 143 && result.hasResult === true) // SIGTERM with result

    const isPartialSuccess = result.exitCode === 124 && result.hasResult === true // Timeout with partial result
    const isError = !isSuccess && !isPartialSuccess

    // Content is just the agent's actual output
    const contentText = result.stdout || result.stderr || 'No output'

    // All metadata goes to structuredContent
    const structuredContent: Record<string, unknown> = {
      agent: this.agentName,
      toolName: this.name,
      exitCode: result.exitCode,
      executionTime: result.executionTime,
      hasResult: result.hasResult || false,
      status: isSuccess ? 'success' : isPartialSuccess ? 'partial' : 'error',
    }

    if (agentType) {
      structuredContent['agentType'] = agentType
    }
    if (model) {
      structuredContent['model'] = model
    }
    if (result.resultJson) {
      structuredContent['result'] = result.resultJson
    }
    if (result.stderr && result.stdout) {
      structuredContent['stderr'] = result.stderr
    }
    if (requestId) {
      structuredContent['requestId'] = requestId
    }

    // Include statistics
    structuredContent['usageCount'] = this.executionStats.count
    structuredContent['averageTime'] = Math.round(
      this.executionStats.totalTime / this.executionStats.count
    )

    return {
      content: [
        {
          type: 'text',
          text: contentText,
        },
      ],
      isError: isError,
      structuredContent,
    }
  }

  /**
   * Create error response
   *
   * @private
   * @param errorMessage - Error message to display
   * @returns Error response in MCP format
   */
  private createErrorResponse(errorMessage: string): McpToolResponse {
    const errorStructuredContent: Record<string, unknown> = {
      status: 'error',
      error: errorMessage,
      agent: this.agentName,
      toolName: this.name,
    }

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${errorMessage}`,
        },
      ],
      isError: true,
      structuredContent: errorStructuredContent,
    }
  }

  /**
   * Generate unique request ID for tracking
   *
   * @private
   * @returns Unique request identifier
   */
  private generateRequestId(): string {
    return `${this.name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Update execution statistics
   *
   * @private
   * @param executionTime - Time taken for execution
   */
  private updateExecutionStats(executionTime: number): void {
    this.executionStats.count += 1
    this.executionStats.totalTime += executionTime
    this.executionStats.lastUsed = new Date()
  }

  /**
   * Get execution statistics for monitoring
   *
   * @returns Execution statistics
   */
  getExecutionStats(): { count: number; totalTime: number; lastUsed: Date } {
    return { ...this.executionStats }
  }
}
