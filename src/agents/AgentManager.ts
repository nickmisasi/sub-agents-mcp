import fs from 'node:fs'
import path from 'node:path'
import type { ServerConfig } from 'src/config/ServerConfig'
import type { AgentDefinition } from 'src/types/AgentDefinition'
import { type Logger, Logger as LoggerClass } from 'src/utils/Logger'

/**
 * AgentManager class for discovering, loading, parsing, and caching agent definitions.
 *
 * Provides automatic detection of .md/.txt files in configured directory,
 * parsing of Claude Code sub-agent format, and efficient caching with
 * file change detection.
 */
export class AgentManager {
  private logger: Logger

  constructor(private config: ServerConfig) {
    this.logger = new LoggerClass(config.logLevel)
  }

  /**
   * Retrieves a specific agent definition by name.
   *
   * @param name - The name of the agent to retrieve
   * @returns Promise resolving to the agent definition or undefined if not found
   * @throws {Error} When agent name is invalid
   */
  async getAgent(name: string): Promise<AgentDefinition | undefined> {
    // Input validation for security
    if (!name || typeof name !== 'string') {
      throw new Error('Invalid agent name: agent name is required')
    }

    if (name.trim().length === 0) {
      throw new Error('Invalid agent name: empty agent name not allowed')
    }

    if (name.length > 255) {
      throw new Error('Invalid agent name: too long agent name')
    }

    // Check for invalid characters that could be used for path traversal or injection
    const invalidChars = /[<>:"/\\|?*;`$()&|\s]/
    if (invalidChars.test(name)) {
      throw new Error('Invalid agent name: forbidden characters detected')
    }

    // Check for control characters using char code inspection
    for (let i = 0; i < name.length; i++) {
      const charCode = name.charCodeAt(i)
      if ((charCode >= 0 && charCode <= 31) || charCode === 127) {
        throw new Error('Invalid agent name: forbidden characters detected')
      }
    }

    // Check for path traversal attempts
    if (name.includes('..') || name.includes('./') || name.includes('.\\')) {
      throw new Error('Invalid agent name: path traversal attempt detected')
    }

    const agents = await this.loadAgentsFromDirectory()
    return agents.get(name)
  }

  /**
   * Lists all available agent definitions.
   *
   * @returns Promise resolving to an array of all agent definitions
   */
  async listAgents(): Promise<AgentDefinition[]> {
    const agents = await this.loadAgentsFromDirectory()
    return Array.from(agents.values())
  }

  /**
   * Refreshes the agents by re-scanning the agents directory.
   * Forces reload of all agent definitions from disk.
   *
   * @returns Promise resolving when refresh is complete
   */
  async refreshAgents(): Promise<void> {
    await this.loadAgentsFromDirectory()
  }

  /**
   * Loads all agent definitions from the configured directory.
   * Scans for .md and .txt files and parses them as agent definitions.
   *
   * @returns Map of agent name to agent definition
   */
  private async loadAgentsFromDirectory(): Promise<Map<string, AgentDefinition>> {
    try {
      const agentsDir = path.resolve(this.config.agentsDir)
      this.logger.info('Starting agent discovery', { directory: agentsDir })

      const files = await fs.promises.readdir(agentsDir)

      const agentFiles = files.filter((file) => file.endsWith('.md') || file.endsWith('.txt'))

      this.logger.info('Agent definition files discovered', {
        totalFiles: files.length,
        agentFiles: agentFiles.length,
        files: agentFiles,
      })

      const agents = new Map<string, AgentDefinition>()

      for (const file of agentFiles) {
        const filePath = path.join(agentsDir, file)
        try {
          const agent = await this.loadAgentFromFile(filePath)
          if (agent) {
            agents.set(agent.name, agent)
            this.logger.debug('Agent definition loaded successfully', {
              name: agent.name,
              filePath: agent.filePath,
              description: agent.description,
            })
          }
        } catch (error) {
          this.logger.error(
            'Failed to load agent definition from file',
            error instanceof Error ? error : undefined,
            { filePath }
          )
        }
      }

      this.logger.info('Agent discovery completed', {
        loadedAgents: agents.size,
        timestamp: new Date().toISOString(),
      })

      return agents
    } catch (error) {
      this.logger.error(
        'Failed to scan agents directory',
        error instanceof Error ? error : undefined,
        { directory: this.config.agentsDir }
      )
      throw new Error(`Failed to load agents from directory: ${this.config.agentsDir}`)
    }
  }

  /**
   * Loads and parses a single agent definition from a file.
   *
   * @param filePath - Absolute path to the agent definition file
   * @returns Promise resolving to the parsed agent definition or undefined
   */
  private async loadAgentFromFile(filePath: string): Promise<AgentDefinition | undefined> {
    try {
      this.logger.debug('Loading agent definition from file', { filePath })

      const content = await fs.promises.readFile(filePath, 'utf-8')
      const stats = await fs.promises.stat(filePath)

      // Parse frontmatter if present
      const { frontmatter, bodyContent } = this.parseFrontmatter(content)

      // Extract agent name from filename (without extension) as fallback
      const fileName = path.basename(filePath)
      const fileBaseName = fileName.replace(/\.(md|txt)$/, '')

      // Use frontmatter name if available, otherwise use filename
      const agentName = frontmatter.name || fileBaseName

      // Use frontmatter description if available, otherwise extract from content
      const description = frontmatter.description || this.extractDescription(bodyContent || content)

      const agentDefinition: AgentDefinition = {
        name: agentName,
        description,
        content: bodyContent || content,
        filePath,
        lastModified: stats.mtime,
        ...(frontmatter.model && { model: frontmatter.model }),
        ...(frontmatter.color && { color: frontmatter.color }),
        ...(frontmatter.tools && { tools: frontmatter.tools }),
        ...(frontmatter.agentType && { agentType: frontmatter.agentType }),
      }

      this.logger.debug('Agent definition parsed successfully', {
        name: agentName,
        description,
        contentLength: content.length,
        lastModified: stats.mtime?.toISOString() ?? 'unknown',
        hasFrontmatter: !!frontmatter.name,
        model: frontmatter.model,
        color: frontmatter.color,
        agentType: frontmatter.agentType,
      })

      return agentDefinition
    } catch (error) {
      this.logger.error(
        'Error reading agent definition file',
        error instanceof Error ? error : undefined,
        { filePath }
      )
      return undefined
    }
  }

  /**
   * Parses YAML frontmatter from markdown content (Claude Code format).
   * Extracts metadata like name, description, tools, model, color, and agentType.
   *
   * @param content - The full file content
   * @returns Object with parsed frontmatter and remaining body content
   */
  private parseFrontmatter(content: string): {
    frontmatter: {
      name?: string
      description?: string
      tools?: string
      model?: string
      color?: string
      agentType?: 'cursor' | 'claude'
    }
    bodyContent: string | null
  } {
    // Match YAML frontmatter between --- delimiters
    const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/

    const match = content.match(frontmatterRegex)

    if (!match) {
      // No frontmatter found, return empty metadata
      return {
        frontmatter: {},
        bodyContent: null,
      }
    }

    const frontmatterText = match[1]
    const bodyContent = match[2]

    const frontmatter: {
      name?: string
      description?: string
      tools?: string
      model?: string
      color?: string
      agentType?: 'cursor' | 'claude'
    } = {}

    if (frontmatterText) {
      // Parse simple YAML key-value pairs
      const lines = frontmatterText.split('\n')

      for (const line of lines) {
        // Match key: value or key: 'value' or key: "value"
        const keyValueMatch = line.match(/^(\w+):\s*(.+)$/)

        if (keyValueMatch) {
          const key = keyValueMatch[1]?.trim()
          let value = keyValueMatch[2]?.trim()

          if (key && value) {
            // Remove quotes if present
            if (
              (value.startsWith("'") && value.endsWith("'")) ||
              (value.startsWith('"') && value.endsWith('"'))
            ) {
              value = value.slice(1, -1)
            }

            // Store relevant fields
            if (key === 'name') {
              frontmatter.name = value
            } else if (key === 'description') {
              frontmatter.description = value
            } else if (key === 'tools') {
              frontmatter.tools = value
            } else if (key === 'model') {
              frontmatter.model = value
            } else if (key === 'color') {
              frontmatter.color = value
            } else if (key === 'agentType') {
              // Validate agentType value
              if (value === 'cursor' || value === 'claude') {
                frontmatter.agentType = value
              }
            }
          }
        }
      }
    }

    return {
      frontmatter,
      bodyContent: bodyContent ?? null,
    }
  }

  /**
   * Extracts description from agent file content.
   * Looks for first heading or first line as description.
   *
   * @param content - The file content to parse
   * @returns Extracted description or default message
   */
  private extractDescription(content: string): string {
    const lines = content.split('\n').filter((line) => line.trim())

    // Look for first markdown heading
    for (const line of lines) {
      if (line.startsWith('#')) {
        return line.replace(/^#+\s*/, '').trim()
      }
    }

    // Fall back to first non-empty line
    if (lines.length > 0 && lines[0]) {
      return lines[0].trim()
    }

    return 'Agent definition'
  }
}
