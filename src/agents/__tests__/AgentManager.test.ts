import { AgentManager } from 'src/agents/AgentManager'
import type { ServerConfig } from 'src/config/ServerConfig'
import type { AgentDefinition } from 'src/types/AgentDefinition'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock fs module
vi.mock('node:fs', () => ({
  default: {
    promises: {
      readdir: vi.fn(),
      readFile: vi.fn(),
      stat: vi.fn(),
    },
  },
}))

// Mock path module
vi.mock('node:path', () => ({
  default: {
    resolve: vi.fn(),
    join: vi.fn(),
    basename: vi.fn(),
  },
  resolve: vi.fn(),
  join: vi.fn(),
  basename: vi.fn(),
}))

// Import mocked modules
import fs from 'node:fs'
import path from 'node:path'

// Type the mocked functions
const mockReaddir = vi.mocked(fs.promises.readdir)
const mockReadFile = vi.mocked(fs.promises.readFile)
const mockStat = vi.mocked(fs.promises.stat)
const mockResolve = vi.mocked(path.resolve)
const mockJoin = vi.mocked(path.join)
const mockBasename = vi.mocked(path.basename)

describe('AgentManager', () => {
  let agentManager: AgentManager
  let mockConfig: ServerConfig

  beforeEach(() => {
    // Clear all mock functions
    mockReaddir.mockClear()
    mockReadFile.mockClear()
    mockStat.mockClear()
    mockResolve.mockClear()
    mockJoin.mockClear()
    mockBasename.mockClear()

    // Create mock config
    mockConfig = {
      agentsDir: '/test/agents',
      serverName: 'test-server',
      serverVersion: '1.0.0',
      agentType: 'cursor',
      logLevel: 'info',
      executionTimeoutMs: 300000,
    } as ServerConfig

    agentManager = new AgentManager(mockConfig)
  })

  afterEach(() => {
    // Clear all mock functions
    mockReaddir.mockClear()
    mockReadFile.mockClear()
    mockStat.mockClear()
    mockResolve.mockClear()
    mockJoin.mockClear()
    mockBasename.mockClear()
  })

  describe('File Discovery', () => {
    it('should discover .md and .txt files in agents directory', async () => {
      // Arrange
      const mockFiles = ['agent1.md', 'agent2.txt', 'readme.pdf', 'config.json']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = '# Test Agent\nThis is a test agent.'

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockImplementation((dir, file) => `${dir}/${file}`)
      mockBasename.mockImplementation((filePath) => {
        const parts = filePath.split('/')
        return parts[parts.length - 1]
      })

      // Act
      const agents = await agentManager.listAgents()

      // Assert
      expect(agents).toHaveLength(2) // Only .md and .txt files
      expect(mockReaddir).toHaveBeenCalledWith('/test/agents')
      expect(agents.some((agent) => agent.name === 'agent1')).toBe(true)
      expect(agents.some((agent) => agent.name === 'agent2')).toBe(true)
    })

    it('should handle empty agents directory', async () => {
      // Arrange
      mockReaddir.mockResolvedValue([] as unknown as fs.Dirent[])
      mockResolve.mockReturnValue('/test/agents')

      // Act
      const agents = await agentManager.listAgents()

      // Assert
      expect(agents).toHaveLength(0)
      expect(mockReaddir).toHaveBeenCalledWith('/test/agents')
    })

    it('should handle directory read errors', async () => {
      // Arrange
      mockReaddir.mockRejectedValue(new Error('Directory not found'))
      mockResolve.mockReturnValue('/test/agents')

      // Act & Assert
      await expect(agentManager.listAgents()).rejects.toThrow(
        'Failed to load agents from directory: /test/agents'
      )
    })
  })

  describe('Agent Definition Parsing', () => {
    it('should parse agent definition from markdown file content', async () => {
      // Arrange
      const mockFiles = ['test-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = '# Test Agent\nThis is a comprehensive test agent for validation.'

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/test-agent.md')
      mockBasename.mockReturnValue('test-agent.md')

      // Act
      const agent = await agentManager.getAgent('test-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('test-agent')
      expect(agent!.description).toBe('Test Agent')
      expect(agent!.content).toBe(mockContent)
      expect(agent!.filePath).toBe('/test/agents/test-agent.md')
      expect(agent!.lastModified).toEqual(mockStats.mtime)
    })

    it('should parse tools and autoApprovalMode from frontmatter', async () => {
      // Arrange
      const mockFiles = ['advanced-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
name: advanced-agent
description: 'Agent with tools and auto-approval'
tools: tool1, tool2, tool3
autoApprovalMode: true
model: claude-3
agentType: claude
---

Content here.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/advanced-agent.md')
      mockBasename.mockReturnValue('advanced-agent.md')

      // Act
      const agent = await agentManager.getAgent('advanced-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('advanced-agent')
      expect(agent!.tools).toEqual(['tool1', 'tool2', 'tool3'])
      expect(agent!.autoApprovalMode).toBe(true)
      expect(agent!.agentType).toBe('claude')
    })

    it('should parse Claude Code format with YAML frontmatter', async () => {
      // Arrange
      const mockFiles = ['playwright-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
name: playwright-test-generator
description: 'Use this agent when you need to create automated browser tests using Playwright'
tools: Glob, Grep, Read, LS
model: sonnet
agentType: claude
color: blue
---

This agent helps create Playwright tests.

# Usage
Call this agent when you need to test browser functionality.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/playwright-agent.md')
      mockBasename.mockReturnValue('playwright-agent.md')

      // Act
      const agent = await agentManager.getAgent('playwright-test-generator')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('playwright-test-generator')
      expect(agent!.description).toBe(
        'Use this agent when you need to create automated browser tests using Playwright'
      )
      expect(agent!.model).toBe('sonnet')
      expect(agent!.agentType).toBe('claude')
      expect(agent!.color).toBe('blue')
      expect(agent!.tools).toEqual(['Glob', 'Grep', 'Read', 'LS'])
      expect(agent!.content).not.toContain('---') // Content should not include frontmatter
      expect(agent!.content).toContain('This agent helps create Playwright tests')
      expect(agent!.filePath).toBe('/test/agents/playwright-agent.md')
    })

    it('should handle Claude Code format with quoted description containing special characters', async () => {
      // Arrange
      const mockFiles = ['special-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
name: special-test-agent
description: "Agent with special: characters, and commas"
model: opus
---

Agent content here.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/special-agent.md')
      mockBasename.mockReturnValue('special-agent.md')

      // Act
      const agent = await agentManager.getAgent('special-test-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('special-test-agent')
      expect(agent!.description).toBe('Agent with special: characters, and commas')
      expect(agent!.model).toBe('opus')
    })

    it('should fallback to filename if no name in frontmatter', async () => {
      // Arrange
      const mockFiles = ['fallback-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
description: 'Agent without explicit name field'
model: sonnet
---

Content here.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/fallback-agent.md')
      mockBasename.mockReturnValue('fallback-agent.md')

      // Act
      const agent = await agentManager.getAgent('fallback-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('fallback-agent')
      expect(agent!.description).toBe('Agent without explicit name field')
      expect(agent!.model).toBe('sonnet')
    })

    it('should fallback to content extraction if no frontmatter description', async () => {
      // Arrange
      const mockFiles = ['partial-frontmatter.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
name: partial-agent
model: sonnet
---

# My Agent Title

This is the content.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/partial-frontmatter.md')
      mockBasename.mockReturnValue('partial-frontmatter.md')

      // Act
      const agent = await agentManager.getAgent('partial-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('partial-agent')
      expect(agent!.description).toBe('My Agent Title') // Extracted from first heading
      expect(agent!.model).toBe('sonnet')
    })

    it('should parse agentType override from frontmatter', async () => {
      // Arrange
      const mockFiles = ['cursor-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
name: cursor-specific-agent
description: 'This agent specifically uses the cursor CLI'
agentType: cursor
model: gpt-4
---

Content for cursor agent.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/cursor-agent.md')
      mockBasename.mockReturnValue('cursor-agent.md')

      // Act
      const agent = await agentManager.getAgent('cursor-specific-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('cursor-specific-agent')
      expect(agent!.agentType).toBe('cursor')
      expect(agent!.model).toBe('gpt-4')
      expect(agent!.description).toBe('This agent specifically uses the cursor CLI')
    })

    it('should validate agentType values and ignore invalid ones', async () => {
      // Arrange
      const mockFiles = ['invalid-type-agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `---
name: invalid-type-agent
description: 'Agent with invalid agentType'
agentType: invalid-value
---

Content here.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/invalid-type-agent.md')
      mockBasename.mockReturnValue('invalid-type-agent.md')

      // Act
      const agent = await agentManager.getAgent('invalid-type-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.agentType).toBeUndefined() // Invalid value should be ignored
    })

    it('should extract description from first heading in markdown', async () => {
      // Arrange
      const mockFiles = ['agent.md']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = `Some preamble text
# My Custom Agent
This agent does amazing things.`

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/agent.md')
      mockBasename.mockReturnValue('agent.md')

      // Act
      const agent = await agentManager.getAgent('agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.description).toBe('My Custom Agent')
    })

    it('should fallback to first line if no heading found', async () => {
      // Arrange
      const mockFiles = ['simple-agent.txt']
      const mockStats = { mtime: new Date('2025-01-01') }
      const mockContent = 'Simple agent for basic tasks\nWith some additional content.'

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/simple-agent.txt')
      mockBasename.mockReturnValue('simple-agent.txt')

      // Act
      const agent = await agentManager.getAgent('simple-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.description).toBe('Simple agent for basic tasks')
    })

    it('should handle file read errors gracefully', async () => {
      // Arrange
      const mockFiles = ['broken-agent.md']

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockReadFile.mockRejectedValue(new Error('Permission denied'))
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/broken-agent.md')

      // Act
      const agents = await agentManager.listAgents()

      // Assert
      expect(agents).toHaveLength(0) // Should skip broken files
    })
  })

  describe('Agent Loading', () => {
    it('should load agent definitions on every request', async () => {
      // Arrange
      const mockFiles = ['cached-agent.md']
      const mockContent = '# Cached Agent\nThis agent should be loaded.'

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockReturnValue('/test/agents/cached-agent.md')
      mockBasename.mockReturnValue('cached-agent.md')

      // Act
      const firstCall = await agentManager.getAgent('cached-agent')
      const secondCall = await agentManager.getAgent('cached-agent')

      // Assert
      expect(firstCall).toBeDefined()
      expect(secondCall).toBeDefined()
      expect(firstCall).toEqual(secondCall)
      expect(mockReaddir).toHaveBeenCalledTimes(2) // Should read directory each time
    })

    it('should load all agents on every listAgents call', async () => {
      // Arrange
      const mockFiles = ['agent1.md', 'agent2.txt']
      const mockContent = '# Test Agent\nTest content.'

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockImplementation((dir, file) => `${dir}/${file}`)
      mockBasename.mockImplementation((filePath) => {
        const parts = filePath.split('/')
        return parts[parts.length - 1]
      })

      // Act
      const firstList = await agentManager.listAgents()
      const secondList = await agentManager.listAgents()

      // Assert
      expect(firstList).toHaveLength(2)
      expect(secondList).toHaveLength(2)
      expect(mockReaddir).toHaveBeenCalledTimes(2) // Should read directory each time
    })
  })

  describe('Agent Refresh', () => {
    it('should reload agents when refreshAgents is called', async () => {
      // Arrange
      const initialFiles = ['initial-agent.md']
      const refreshedFiles = ['initial-agent.md', 'new-agent.md']
      const mockContent = '# Test Agent\nTest content.'

      mockReadFile.mockResolvedValue(mockContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockImplementation((dir, file) => `${dir}/${file}`)
      mockBasename.mockImplementation((filePath) => {
        const parts = filePath.split('/')
        return parts[parts.length - 1]
      })

      // Set up sequential mock responses
      mockReaddir
        .mockResolvedValueOnce(initialFiles as unknown as fs.Dirent[]) // Initial listAgents
        .mockResolvedValueOnce(refreshedFiles as unknown as fs.Dirent[]) // refreshAgents
        .mockResolvedValueOnce(refreshedFiles as unknown as fs.Dirent[]) // Final listAgents

      // Act - Initial load
      const initialAgents = await agentManager.listAgents()

      // Act - Refresh
      await agentManager.refreshAgents()
      const refreshedAgents = await agentManager.listAgents()

      // Assert
      expect(initialAgents).toHaveLength(1)
      expect(refreshedAgents).toHaveLength(2)
      expect(mockReaddir).toHaveBeenCalledTimes(3) // One for each operation
    })
  })

  describe('Agent Retrieval', () => {
    it('should return undefined for non-existent agent', async () => {
      // Arrange
      mockReaddir.mockResolvedValue([] as unknown as fs.Dirent[])
      mockResolve.mockReturnValue('/test/agents')

      // Act
      const agent = await agentManager.getAgent('non-existent')

      // Assert
      expect(agent).toBeUndefined()
    })

    it('should return correct agent by name', async () => {
      // Arrange
      const mockFiles = ['target-agent.md', 'other-agent.txt']
      const mockStats = { mtime: new Date('2025-01-01') }
      const targetContent = '# Target Agent\nThis is the target agent.'
      const otherContent = '# Other Agent\nThis is the other agent.'

      mockReaddir.mockResolvedValue(mockFiles as unknown as fs.Dirent[])
      mockStat.mockResolvedValue(mockStats as fs.Stats)
      mockReadFile.mockResolvedValueOnce(targetContent).mockResolvedValueOnce(otherContent)
      mockResolve.mockReturnValue('/test/agents')
      mockJoin.mockImplementation((dir, file) => `${dir}/${file}`)
      mockBasename.mockImplementation((filePath) => {
        const parts = filePath.split('/')
        return parts[parts.length - 1]
      })

      // Act
      const agent = await agentManager.getAgent('target-agent')

      // Assert
      expect(agent).toBeDefined()
      expect(agent!.name).toBe('target-agent')
      expect(agent!.description).toBe('Target Agent')
      expect(agent!.content).toBe(targetContent)
    })
  })
})
