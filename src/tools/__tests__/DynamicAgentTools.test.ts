import { AgentManager } from 'src/agents/AgentManager'
import type { ServerConfig } from 'src/config/ServerConfig'
import type { AgentExecutor } from 'src/execution/AgentExecutor'
import { DynamicAgentTool } from 'src/tools/DynamicAgentTools'
import type { AgentDefinition } from 'src/types/AgentDefinition'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
vi.mock('src/agents/AgentManager')
vi.mock('src/execution/AgentExecutor')

describe('DynamicAgentTool', () => {
  let mockAgentExecutor: AgentExecutor
  let mockAgentManager: AgentManager
  let mockConfig: ServerConfig

  beforeEach(() => {
    mockConfig = {
      agentsDir: '/test/agents',
      serverName: 'test-server',
      serverVersion: '1.0.0',
      agentType: 'cursor',
      logLevel: 'info',
      executionTimeoutMs: 300000,
    } as ServerConfig

    mockAgentManager = new AgentManager(mockConfig)
    mockAgentExecutor = {} as AgentExecutor
  })

  describe('sanitizeToolName', () => {
    it('should prefix agent name with agent_', () => {
      const toolName = DynamicAgentTool.sanitizeToolName('test-agent')
      expect(toolName).toBe('agent_test-agent')
    })

    it('should sanitize invalid characters', () => {
      const toolName = DynamicAgentTool.sanitizeToolName('test agent!@#')
      expect(toolName).toBe('agent_test_agent___')
    })

    it('should preserve valid characters', () => {
      const toolName = DynamicAgentTool.sanitizeToolName('test_agent-123')
      expect(toolName).toBe('agent_test_agent-123')
    })
  })

  describe('constructor', () => {
    it('should create tool with sanitized name', () => {
      const tool = new DynamicAgentTool(
        'my-agent',
        'Test description',
        mockAgentExecutor,
        mockAgentManager
      )

      expect(tool.name).toBe('agent_my-agent')
      expect(tool.description).toBe('Test description')
    })

    it('should define proper input schema', () => {
      const tool = new DynamicAgentTool(
        'my-agent',
        'Test description',
        mockAgentExecutor,
        mockAgentManager
      )

      expect(tool.inputSchema).toBeDefined()
      expect(tool.inputSchema.type).toBe('object')
      expect(tool.inputSchema.properties).toHaveProperty('prompt')
      expect(tool.inputSchema.properties).toHaveProperty('output_instructions')
      expect(tool.inputSchema.properties).toHaveProperty('cwd')
      expect(tool.inputSchema.properties).toHaveProperty('extra_args')
      expect(tool.inputSchema.required).toEqual(['prompt'])
    })
  })

  describe('execute', () => {
    let tool: DynamicAgentTool
    let mockAgent: AgentDefinition

    beforeEach(() => {
      mockAgent = {
        name: 'test-agent',
        description: 'Test agent',
        content: 'Agent instructions here',
        filePath: '/test/agents/test-agent.md',
        lastModified: new Date(),
        agentType: 'cursor',
        model: 'gpt-4',
      }

      tool = new DynamicAgentTool('test-agent', 'Test agent', mockAgentExecutor, mockAgentManager)

      // Mock agentManager.getAgent
      vi.spyOn(mockAgentManager, 'getAgent').mockResolvedValue(mockAgent)

      // Mock agentExecutor.executeAgent
      mockAgentExecutor.executeAgent = vi.fn().mockResolvedValue({
        stdout: 'Success output',
        stderr: '',
        exitCode: 0,
        executionTime: 100,
        hasResult: true,
      })
    })

    it('should validate and execute with valid parameters', async () => {
      const params = {
        prompt: 'Test prompt',
      }

      const result = await tool.execute(params)

      expect(result.content).toHaveLength(1)
      expect(result.content[0].text).toBe('Success output')
      expect(result.isError).toBe(false)
    })

    it('should apply default output instructions when not provided', async () => {
      const params = {
        prompt: 'Test prompt',
      }

      await tool.execute(params)

      expect(mockAgentExecutor.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('[Output Instructions]'),
        })
      )
    })

    it('should use custom output instructions when provided', async () => {
      const params = {
        prompt: 'Test prompt',
        output_instructions: 'Return JSON only',
      }

      await tool.execute(params)

      expect(mockAgentExecutor.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('Return JSON only'),
        })
      )
    })

    it('should pass cwd parameter to executor', async () => {
      const params = {
        prompt: 'Test prompt',
        cwd: '/custom/path',
      }

      await tool.execute(params)

      expect(mockAgentExecutor.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          cwd: '/custom/path',
        })
      )
    })

    it('should pass extra_args parameter to executor', async () => {
      const params = {
        prompt: 'Test prompt',
        extra_args: ['--verbose', '--debug'],
      }

      await tool.execute(params)

      expect(mockAgentExecutor.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          extra_args: ['--verbose', '--debug'],
        })
      )
    })

    it('should pass agent agentType and model to executor', async () => {
      const params = {
        prompt: 'Test prompt',
      }

      await tool.execute(params)

      expect(mockAgentExecutor.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'cursor',
          model: 'gpt-4',
        })
      )
    })

    it('should reject invalid parameters - missing prompt', async () => {
      const params = {}

      const result = await tool.execute(params)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Prompt parameter is required')
    })

    it('should reject invalid parameters - empty prompt', async () => {
      const params = {
        prompt: '   ',
      }

      const result = await tool.execute(params)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('cannot be empty')
    })

    it('should reject invalid parameters - prompt too long', async () => {
      const params = {
        prompt: 'a'.repeat(50001),
      }

      const result = await tool.execute(params)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('Prompt too long')
    })

    it('should handle agent not found error', async () => {
      vi.spyOn(mockAgentManager, 'getAgent').mockResolvedValue(undefined)

      const params = {
        prompt: 'Test prompt',
      }

      const result = await tool.execute(params)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toContain('not found')
    })

    it('should handle execution failure', async () => {
      mockAgentExecutor.executeAgent = vi.fn().mockResolvedValue({
        stdout: '',
        stderr: 'Execution error',
        exitCode: 1,
        executionTime: 50,
        hasResult: false,
      })

      const params = {
        prompt: 'Test prompt',
      }

      const result = await tool.execute(params)

      expect(result.isError).toBe(true)
      expect(result.content[0].text).toBe('Execution error')
    })

    it('should update execution statistics', async () => {
      const params = {
        prompt: 'Test prompt',
      }

      await tool.execute(params)
      const stats = tool.getExecutionStats()

      expect(stats.count).toBe(1)
      expect(stats.totalTime).toBe(100)
    })

    it('should aggregate statistics across multiple executions', async () => {
      const params = {
        prompt: 'Test prompt',
      }

      await tool.execute(params)
      await tool.execute(params)
      await tool.execute(params)

      const stats = tool.getExecutionStats()

      expect(stats.count).toBe(3)
      expect(stats.totalTime).toBe(300)
    })
  })
})
