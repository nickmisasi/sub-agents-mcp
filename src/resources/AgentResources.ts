/**
 * AgentResources implementation for publishing agent definitions via MCP
 *
 * Provides MCP resources for agent discovery including a list of all
 * available agents and individual agent definition resources.
 */

import type { AgentManager } from 'src/agents/AgentManager'
import { Logger } from 'src/utils/Logger'

/**
 * MCP resource content type for text responses
 */
interface McpResourceContent {
  [x: string]: unknown
  type: 'text'
  text: string
  uri: string
}

/**
 * MCP resource response format
 */
interface McpResourceResponse {
  [x: string]: unknown
  contents: McpResourceContent[]
}

/**
 * MCP resource definition for publication
 */
interface McpResource {
  [x: string]: unknown
  uri: string
  name: string
  description: string
  mimeType?: string
}

/**
 * AgentResources class for managing agent definition resources in MCP
 *
 * Publishes agent information as MCP resources that clients can discover
 * and read to understand available agents and their capabilities.
 */
export class AgentResources {
  private logger: Logger

  constructor(private agentManager?: AgentManager) {
    this.logger = new Logger('info')
  }

  /**
   * Get list of all published agent resources
   *
   * @returns Promise resolving to array of MCP resource definitions
   */
  async listResources(): Promise<McpResource[]> {
    const startTime = Date.now()

    this.logger.debug('Starting resource listing', {
      timestamp: new Date().toISOString(),
    })

    const resources: McpResource[] = []

    // Add agent list resource (agents are now exposed as tools, not individual resources)
    resources.push({
      uri: 'agents://list',
      name: 'Agent List',
      description: 'List of available agents (each agent is exposed as its own MCP tool)',
      mimeType: 'text/plain',
    })

    this.logger.info('Resource listing completed', {
      resourceCount: resources.length,
      totalTime: Date.now() - startTime,
    })

    return resources
  }

  /**
   * Read content of a specific agent resource
   *
   * @param uri - Resource URI to read
   * @returns Promise resolving to resource content
   * @throws {Error} When resource URI is invalid or not found
   */
  async readResource(uri: string): Promise<McpResourceResponse> {
    const startTime = Date.now()
    const requestId = this.generateRequestId()

    this.logger.info('Resource read requested', {
      requestId,
      uri,
      timestamp: new Date().toISOString(),
    })

    try {
      let result: McpResourceResponse

      if (uri === 'agents://list') {
        result = await this.getAgentListContent()
      } else {
        throw new Error(
          `Invalid resource URI: ${uri}. Individual agents are now exposed as MCP tools with the prefix 'agent_'. Use the agents://list resource to see all available agents.`
        )
      }

      this.logger.info('Resource read completed', {
        requestId,
        uri,
        readTime: Date.now() - startTime,
        contentLength: result.contents[0]?.text?.length || 0,
      })

      return result
    } catch (error) {
      this.logger.error('Resource read failed', error instanceof Error ? error : undefined, {
        requestId,
        uri,
        readTime: Date.now() - startTime,
      })
      throw error
    }
  }

  /**
   * Get content for the agent list resource
   *
   * @private
   * @returns Promise resolving to agent list content
   */
  private async getAgentListContent(): Promise<McpResourceResponse> {
    if (!this.agentManager) {
      return {
        contents: [
          {
            type: 'text',
            text: 'Agent manager not available. No agents can be listed.',
            uri: 'agents://list',
          },
        ],
      }
    }

    try {
      const agents = await this.agentManager.listAgents()

      if (agents.length === 0) {
        return {
          contents: [
            {
              type: 'text',
              text: 'No agents available. Check agent directory configuration.',
              uri: 'agents://list',
            },
          ],
        }
      }

      let listText = `Available Agents (${agents.length} total)\n\n`
      listText += `Each agent is exposed as its own MCP tool with the prefix 'agent_'.\n\n`
      listText += '---\n\n'

      for (const agent of agents) {
        // Sanitize tool name the same way DynamicAgentTool does
        const toolName = `agent_${agent.name.replace(/[^a-zA-Z0-9_-]/g, '_')}`

        listText += `## ${agent.name}\n`
        listText += `**Description:** ${agent.description}\n`
        listText += `**Tool Name:** ${toolName}\n`
        listText += `**File:** ${agent.filePath}\n`
        listText += `**Last Modified:** ${agent.lastModified.toISOString()}\n`

        // Add agent type and model if available
        if (agent.agentType) {
          listText += `**Agent Type:** ${agent.agentType}\n`
        }
        if (agent.model) {
          listText += `**Model:** ${agent.model}\n`
        }

        listText += '\n'
      }

      return {
        contents: [
          {
            type: 'text',
            text: listText,
            uri: 'agents://list',
          },
        ],
      }
    } catch (error) {
      return {
        contents: [
          {
            type: 'text',
            text: `Error loading agent list: ${error instanceof Error ? error.message : 'Unknown error'}`,
            uri: 'agents://list',
          },
        ],
      }
    }
  }

  /**
   * Generate unique request ID for tracking
   *
   * @private
   * @returns Unique request identifier
   */
  private generateRequestId(): string {
    return `resource_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Check if a resource URI is valid with enhanced validation
   *
   * @param uri - Resource URI to validate
   * @returns True if URI is valid
   */
  isValidResourceUri(uri: string): boolean {
    if (!uri || typeof uri !== 'string') {
      return false
    }

    // Only agents://list is valid now; individual agents are exposed as tools
    return uri === 'agents://list'
  }
}
