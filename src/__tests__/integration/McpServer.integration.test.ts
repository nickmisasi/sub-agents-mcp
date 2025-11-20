/**
 * Integration tests for McpServer with tools and resources
 *
 * Tests the complete MCP server functionality including dynamic agent tool
 * registration, agent resources publication, and MCP client interaction.
 */

import { AgentManager } from 'src/agents/AgentManager'
import { AgentExecutor } from 'src/execution/AgentExecutor'
import { McpServer } from 'src/server/McpServer'
import type { ServerConfigInterface } from 'src/types'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('McpServer Integration', () => {
  let server: McpServer
  let mockConfig: ServerConfigInterface

  beforeEach(() => {
    mockConfig = {
      serverName: 'test-mcp-server',
      serverVersion: '1.0.0',
      agentsDir: './test-agents',
      logLevel: 'info',
      agentType: 'cursor',
      executionTimeoutMs: 300000,
    }
  })

  afterEach(async () => {
    if (server) {
      await server.close()
    }
  })

  describe('tool registration', () => {
    beforeEach(() => {
      server = new McpServer(mockConfig)
    })

    it('should register dynamic agent tools during initialization', async () => {
      const tools = await server.listTools()

      expect(tools).toBeDefined()
      expect(Array.isArray(tools)).toBe(true)

      // Each agent should be exposed as its own tool with agent_ prefix
      const agentTools = tools.filter((tool) => tool.name.startsWith('agent_'))

      // Tools may be empty if agents directory doesn't exist or has no agents
      // Verify structure if any tools exist
      if (agentTools.length > 0) {
        const agentTool = agentTools[0]
        expect(agentTool.description).toBeDefined()
        expect(agentTool.inputSchema).toBeDefined()
      }
    })

    it('should have correct dynamic agent tool schema', async () => {
      const tools = await server.listTools()
      const agentTools = tools.filter((tool) => tool.name.startsWith('agent_'))

      // Only verify schema if tools exist
      if (agentTools.length > 0) {
        // Check schema of first agent tool
        const agentTool = agentTools[0]
        expect(agentTool?.inputSchema).toBeDefined()
        expect(agentTool?.inputSchema.type).toBe('object')
        expect(agentTool?.inputSchema.properties).toHaveProperty('prompt')
        expect(agentTool?.inputSchema.properties).toHaveProperty('output_instructions')
        expect(agentTool?.inputSchema.properties).toHaveProperty('cwd')
        expect(agentTool?.inputSchema.properties).toHaveProperty('extra_args')
        expect(agentTool?.inputSchema.required).toEqual(['prompt'])
      }
    })
  })

  describe('agent resources', () => {
    beforeEach(() => {
      server = new McpServer(mockConfig)
    })

    it('should publish agent list resource', async () => {
      // This test will fail initially as agent resources are not implemented
      const resources = await server.listResources()

      expect(resources).toBeDefined()
      expect(Array.isArray(resources)).toBe(true)

      const agentListResource = resources.find((resource) => resource.uri === 'agents://list')
      expect(agentListResource).toBeDefined()
      expect(agentListResource?.name).toBe('Agent List')
      expect(agentListResource?.description).toContain('available agents')
    })

    it('should only provide list resource (agents are now tools)', async () => {
      const resources = await server.listResources()

      // Only agents://list should be available; individual agents are now exposed as tools
      const agentResources = resources.filter((resource) => resource.uri.startsWith('agents://'))

      expect(agentResources.length).toBe(1)
      expect(agentResources[0].uri).toBe('agents://list')
    })

    it('should reject invalid individual agent resource URIs', async () => {
      // Individual agents are no longer resources, so this should fail
      try {
        await server.readResource('agents://test-agent')
        // Should throw error
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
      }
    })
  })

  describe('tool execution', () => {
    beforeEach(() => {
      server = new McpServer(mockConfig)
    })

    it('should execute dynamic agent tool with valid parameters', async () => {
      // Get available tools first to find an agent tool
      const tools = await server.listTools()
      const agentTool = tools.find((tool) => tool.name.startsWith('agent_'))

      // Skip test if no agents available
      if (!agentTool) {
        return
      }

      const params = {
        prompt: 'Hello, world!',
        cwd: process.cwd(),
      }

      const result = await server.callTool(agentTool.name, params)

      expect(result).toBeDefined()
      expect(result.content).toBeDefined()
      expect(Array.isArray(result.content)).toBe(true)
      expect(result.content.length).toBeGreaterThan(0)

      const textContent = result.content.find((c) => c.type === 'text')
      expect(textContent).toBeDefined()
      expect(textContent?.text).toBeDefined()
    })

    it('should validate dynamic agent tool parameters', async () => {
      // Get available tools first
      const tools = await server.listTools()
      const agentTool = tools.find((tool) => tool.name.startsWith('agent_'))

      // Skip test if no agents available
      if (!agentTool) {
        return
      }

      const invalidParams = {
        // Missing required 'prompt' parameter
      }

      const result = (await server.callTool(agentTool.name, invalidParams)) as any
      expect(result.content).toBeDefined()
      const textContent = result.content.find((c: any) => c.type === 'text')
      expect(textContent?.text).toMatch(/prompt.*required/i)
    })

    it('should handle non-existent agent tool gracefully', async () => {
      // Try to call a non-existent agent tool
      try {
        await server.callTool('agent_nonexistent-agent', {
          prompt: 'Test prompt',
        })
        // Should throw error
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        // Error should indicate unknown tool or initialization failure
        expect(String(error)).toMatch(/unknown tool|failed to initialize/i)
      }
    })
  })

  describe('resource access', () => {
    beforeEach(() => {
      server = new McpServer(mockConfig)
    })

    it('should provide agent list resource content', async () => {
      // This test will fail initially as resource access is not implemented
      const resource = await server.readResource('agents://list')

      expect(resource).toBeDefined()
      expect(resource.contents).toBeDefined()
      expect(Array.isArray(resource.contents)).toBe(true)

      if (resource.contents.length > 0) {
        const content = resource.contents[0]
        expect(content.type).toBe('text')
        expect(content.text).toBeDefined()
      }
    })

    it('should reject individual agent resource URIs (agents are now tools)', async () => {
      // Individual agent resources should no longer be accessible
      try {
        await server.readResource('agents://test-agent')
        // Should throw error
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        // Error should indicate invalid URI
        expect(String(error)).toMatch(/invalid.*uri|exposed as.*tools/i)
      }
    })
  })

  describe('MCP client interaction', () => {
    beforeEach(() => {
      server = new McpServer(mockConfig)
    })

    it('should handle complete agent execution workflow', async () => {
      // This test simulates a complete MCP client interaction
      // 1. List available tools
      const tools = await server.listTools()
      const agentTool = tools.find((t) => t.name.startsWith('agent_'))

      // Skip workflow test if no agents available
      if (!agentTool) {
        return
      }

      // 2. List available resources
      const resources = await server.listResources()
      expect(resources.find((r) => r.uri === 'agents://list')).toBeDefined()

      // 3. Read agent list resource
      const agentList = await server.readResource('agents://list')
      expect(agentList).toBeDefined()

      // 4. Execute dynamic agent tool
      if (agentTool) {
        const executionResult = await server.callTool(agentTool.name, {
          prompt: 'Test execution',
          cwd: process.cwd(),
        })

        expect(executionResult).toBeDefined()
        expect(executionResult.content).toBeDefined()
      }
    })

    it('should maintain consistent state across operations', async () => {
      // Perform multiple operations to ensure server state consistency
      const tools1 = await server.listTools()
      const resources1 = await server.listResources()

      // Execute a tool if available
      const agentTool = tools1.find((t) => t.name.startsWith('agent_'))
      if (agentTool) {
        await server.callTool(agentTool.name, {
          prompt: 'State test',
        })
      }

      // Check that tool and resource lists remain consistent
      const tools2 = await server.listTools()
      const resources2 = await server.listResources()

      expect(tools2).toEqual(tools1)
      expect(resources2).toEqual(resources1)
    })
  })

  describe('error handling', () => {
    beforeEach(() => {
      server = new McpServer(mockConfig)
    })

    it('should handle unknown tool calls gracefully', async () => {
      await expect(server.callTool('unknown_tool', {})).rejects.toThrow(
        /unknown.*tool|failed to initialize/i
      )
    })

    it('should handle invalid resource URIs gracefully', async () => {
      await expect(server.readResource('invalid://resource')).rejects.toThrow(
        /unknown.*resource|invalid.*uri/i
      )
    })

    it('should provide meaningful error messages', async () => {
      // Get an agent tool first
      const tools = await server.listTools()
      const agentTool = tools.find((t) => t.name.startsWith('agent_'))

      if (agentTool) {
        const result = (await server.callTool(agentTool.name, {
          /* missing required params */
        })) as any
        expect(result.content).toBeDefined()
        const textContent = result.content.find((c: any) => c.type === 'text')
        expect(textContent?.text).toMatch(/prompt.*required/i)
      }
    })
  })

  describe('agent name collision detection', () => {
    it('should detect and warn about tool name collisions', async () => {
      // Create a temporary test directory with colliding agent names
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const { tmpdir } = await import('node:os')

      const testDir = path.join(tmpdir(), 'mcp-collision-test-agents')
      await fs.mkdir(testDir, { recursive: true })

      try {
        // Create agents with names that sanitize to the same tool name
        await fs.writeFile(
          path.join(testDir, 'my_agent.md'),
          '# My Agent\n\nFirst agent with underscores.'
        )
        await fs.writeFile(
          path.join(testDir, 'my agent.md'),
          '# My Agent\n\nSecond agent with spaces.'
        )
        await fs.writeFile(
          path.join(testDir, 'my-agent.md'),
          '# My Agent\n\nThird agent with hyphens (should not collide).'
        )

        const collisionConfig = {
          ...mockConfig,
          agentsDir: testDir,
          logLevel: 'debug' as const,
        }

        // Create server and capture logs
        const logMessages: string[] = []
        const originalConsoleLog = console.log
        const originalConsoleWarn = console.warn
        const originalConsoleError = console.error

        console.log = (...args: any[]) => {
          logMessages.push(args.join(' '))
          originalConsoleLog(...args)
        }
        console.warn = (...args: any[]) => {
          logMessages.push(args.join(' '))
          originalConsoleWarn(...args)
        }
        console.error = (...args: any[]) => {
          logMessages.push(args.join(' '))
          originalConsoleError(...args)
        }

        try {
          const collisionServer = new McpServer(collisionConfig)

          // List tools to trigger initialization
          const tools = await collisionServer.listTools()

          // my_agent and "my agent" should both sanitize to agent_my_agent
          // my-agent should be agent_my-agent (no collision)
          const agentTools = tools.filter((tool) => tool.name.startsWith('agent_my'))

          // Should have 2 unique tool names (agent_my_agent and agent_my-agent)
          // But 3 agents were created
          expect(agentTools.length).toBe(2)

          // Check that collision was logged
          const logString = logMessages.join('\n')
          expect(logString).toMatch(/collision/i)
          expect(logString).toMatch(/agent_my_agent/)

          await collisionServer.close()
        } finally {
          console.log = originalConsoleLog
          console.warn = originalConsoleWarn
          console.error = originalConsoleError
        }
      } finally {
        // Cleanup
        await fs.rm(testDir, { recursive: true, force: true }).catch(() => {})
      }
    })
  })
})
