# Migration Guide: Dynamic Agent Tools

This document explains the changes in the dynamic agent tools architecture and how to migrate from the old `run_agent` tool to the new per-agent tool system.

## What Changed

### Before (Old Architecture)
- Single MCP tool: `run_agent`
- Required parameters: `agent` (string), `prompt` (string)
- Each agent was an MCP resource
- Usage: Call `run_agent` with agent name as a parameter

### After (New Architecture)
- Multiple MCP tools: one per agent with `agent_` prefix
- Required parameters: `prompt` (string)
- New parameter: `output_instructions` (optional, with smart default)
- Agents are tools, not resources (except `agents://list` for discovery)
- Usage: Call the specific agent tool directly

## Migration Examples

### Old Way
```typescript
// Call the run_agent tool
{
  "tool": "run_agent",
  "params": {
    "agent": "code-reviewer",
    "prompt": "Review this function",
    "cwd": "/path/to/project"
  }
}
```

### New Way
```typescript
// Call the agent directly as a tool
{
  "tool": "agent_code-reviewer",
  "params": {
    "prompt": "Review this function",
    "output_instructions": "Provide a numbered list", // Optional
    "cwd": "/path/to/project"
  }
}
```

## New Features

### 1. Output Instructions
Every agent tool now supports an `output_instructions` parameter:

```typescript
{
  "tool": "agent_test-writer",
  "params": {
    "prompt": "Create tests for UserService",
    "output_instructions": "Return only the test code, no explanations"
  }
}
```

**Default Output Instructions:**
If you don't specify `output_instructions`, the agent will automatically:
> "Provide a brief summary of what you accomplished or failed to do, and suggest potential next steps if necessary."

### 2. Per-Agent Configuration
Agents can now override server configuration in their frontmatter:

```markdown
---
name: my-specialized-agent
description: 'Uses Claude CLI with Opus model'
agentType: claude
model: opus
---
```

This agent will use the Claude CLI even if your server is configured for Cursor.

### 3. Tool Name Sanitization
Agent names are automatically sanitized to create valid MCP tool names:
- Prefix: `agent_` is added
- Special characters are replaced with underscores
- Examples:
  - `code-reviewer.md` → `agent_code-reviewer`
  - `test writer!.md` → `agent_test_writer_`

## Breaking Changes

### 1. Tool Name
- **Before:** Always use `run_agent` tool
- **After:** Use specific tool per agent: `agent_{agent-name}`

### 2. Parameter Structure
- **Before:** `{ agent: "name", prompt: "..." }`
- **After:** `{ prompt: "..." }` (agent name is in the tool name itself)

### 3. Resource Access
- **Before:** Individual agents available at `agents://{agent-name}`
- **After:** Only `agents://list` resource available; individual agents are tools

## Discovery

To find available agents:

### Via Resources
```typescript
// Read the agents://list resource
{
  "resource": "agents://list"
}

// Returns information about all agents including their tool names
```

### Via Tools List
```typescript
// List all MCP tools
// Each agent appears as agent_{name}
```

## Tool Parameters

All agent tools now support:

| Parameter | Required | Type | Description |
|-----------|----------|------|-------------|
| `prompt` | Yes | string | Task description/instructions |
| `output_instructions` | No | string | Format instructions for response (default: summary + next steps) |
| `cwd` | No | string | Working directory |
| `extra_args` | No | string[] | Additional CLI arguments |

## Benefits of New Architecture

1. **Cleaner Interface**: No need to pass agent name as parameter
2. **Better Discovery**: Each agent appears as a first-class tool in tool listings
3. **Output Control**: New `output_instructions` parameter for response formatting
4. **Type Safety**: Each tool has its own schema
5. **Per-Agent Settings**: Agents can override server configuration (agentType, model)

## Testing Your Migration

After updating to the new architecture:

1. **Check tool list**: Verify your agents appear as `agent_*` tools
2. **Test execution**: Call an agent tool with just a `prompt`
3. **Try output instructions**: Experiment with custom output formatting
4. **Verify metadata**: Check that agentType and model are respected

Example test:
```typescript
const tools = await listTools()
console.log(tools.filter(t => t.name.startsWith('agent_')))

const result = await callTool('agent_code-reviewer', {
  prompt: 'Review UserService.ts',
  output_instructions: 'Be concise'
})
```

