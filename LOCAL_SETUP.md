# Running Sub-Agents MCP Locally

This guide explains how to use your locally developed sub-agents-mcp server without publishing to npm.

## Quick Start

1. **Build**: `npm run build`
2. **Add to MCP config**:
   ```json
   {
     "mcpServers": {
       "sub-agents": {
         "command": "npx",
         "args": ["/Users/nickmisasi/workspace/sub-agents-mcp"],
         "env": {
           "AGENTS_DIR": "/path/to/your/agents"
         }
       }
     }
   }
   ```
3. **Restart your IDE**
4. **Use your agents**: Each agent is exposed as its own MCP tool with the prefix `agent_`

## How It Works

Each agent definition file in your `AGENTS_DIR` becomes its own MCP tool:

- Agent file: `playwright-test-generator.md` → Tool: `agent_playwright-test-generator`
- Agent file: `code-reviewer.md` → Tool: `agent_code-reviewer`

This means you can call agents directly by their tool name instead of using a generic `run_agent` tool.

## Prerequisites

1. Build the project: `npm run build`
2. Ensure you have agent definition files in a directory (e.g., `~/my-agents/`)

## Configuration

### npx vs node

You can run the server using either `npx` or `node`:

- **npx** (recommended): Cleaner, just point to the package directory
  - `"command": "npx"` with `"args": ["/path/to/sub-agents-mcp"]`
  - npx will automatically find and execute the `sub-agents-mcp` binary defined in package.json
  
- **node**: Direct execution of the built file
  - `"command": "node"` with `"args": ["/path/to/sub-agents-mcp/dist/index.js"]`
  - More explicit but requires knowing the exact path to the built file

Both work identically, but npx is cleaner and doesn't require remembering the `/dist/index.js` path.

### For Cursor IDE

Add this to your Cursor MCP settings file (`~/.cursor/mcp.json` or in your project's `.cursor/mcp.json`):

**Option 1: Using npx (recommended)**
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": [
        "/Users/nickmisasi/workspace/sub-agents-mcp"
      ],
      "env": {
        "AGENTS_DIR": "/absolute/path/to/your/agents",
        "AGENT_TYPE": "cursor",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Option 2: Using node directly**
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "node",
      "args": [
        "/Users/nickmisasi/workspace/sub-agents-mcp/dist/index.js"
      ],
      "env": {
        "AGENTS_DIR": "/absolute/path/to/your/agents",
        "AGENT_TYPE": "cursor",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

### For Claude Desktop

Add this to your Claude Desktop MCP settings file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

**Option 1: Using npx (recommended)**
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": [
        "/Users/nickmisasi/workspace/sub-agents-mcp"
      ],
      "env": {
        "AGENTS_DIR": "/absolute/path/to/your/agents",
        "AGENT_TYPE": "claude",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

**Option 2: Using node directly**
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "node",
      "args": [
        "/Users/nickmisasi/workspace/sub-agents-mcp/dist/index.js"
      ],
      "env": {
        "AGENTS_DIR": "/absolute/path/to/your/agents",
        "AGENT_TYPE": "claude",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

## Per-Project Setup

You can also set this up per-project by creating a `.cursor/mcp.json` file in any repo:

### Example: Project-Specific Agent Directory

```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": [
        "/Users/nickmisasi/workspace/sub-agents-mcp"
      ],
      "env": {
        "AGENTS_DIR": "/Users/nickmisasi/workspace/my-project/agents",
        "AGENT_TYPE": "cursor",
        "LOG_LEVEL": "info"
      }
    }
  }
}
```

This will use agents specific to "my-project" when working in that repo.

## Environment Variables

### Required
- `AGENTS_DIR`: Absolute path to directory containing your `.md` agent files

### Optional
- `AGENT_TYPE`: Default agent type (`cursor` or `claude`). Default: `cursor`
  - Individual agents can override this with `agentType` in their frontmatter
- `LOG_LEVEL`: Logging level (`debug`, `info`, `warn`, `error`). Default: `info`
- `SERVER_NAME`: MCP server name. Default: `sub-agents-mcp`
- `SERVER_VERSION`: MCP server version. Default: `0.1.0`
- `EXECUTION_TIMEOUT_MS`: Timeout for agent execution in milliseconds. Default: `300000` (5 minutes)
- `CLI_API_KEY`: API key for cursor-agent CLI (if required)

## Agent Format

Create agent files in your `AGENTS_DIR` with either simple format or Claude Code format:

### Simple Format (backward compatible)
```markdown
# My Agent

This is what the agent does.

## Instructions
- Step 1
- Step 2
```

### Claude Code Format (recommended)
```markdown
---
name: my-custom-agent
description: 'What this agent does'
tools: Glob, Grep, Read, Write
model: sonnet
agentType: claude
color: blue
---

# Agent Instructions

Detailed instructions here...
```

## Using Agents

### Calling an Agent

Each agent becomes its own MCP tool. For example, if you have an agent named `code-reviewer.md`:

```typescript
// The agent is available as: agent_code-reviewer

// Call it with:
{
  "prompt": "Review this function for bugs",
  "output_instructions": "Provide a numbered list of issues", // Optional
  "cwd": "/path/to/project", // Optional
  "extra_args": ["--verbose"] // Optional
}
```

### Tool Parameters

All agent tools support these parameters:

- **`prompt`** (required): Your task description or instructions
- **`output_instructions`** (optional): How you want the agent to format its response
  - Default: "Provide a brief summary of what you accomplished or failed to do, and suggest potential next steps if necessary."
  - Examples: "Return JSON only", "Summarize in bullet points", "Be verbose"
- **`cwd`** (optional): Working directory for execution
- **`extra_args`** (optional): Additional CLI arguments

### Discovering Available Agents

Use the `agents://list` MCP resource to see all available agents and their tool names:

```json
// Resource: agents://list
// Shows: agent name, description, tool name, model, agentType, etc.
```

## Development Workflow

1. Make changes to the TypeScript source
2. Rebuild: `npm run build`
3. Restart your IDE or MCP client to pick up changes
4. Test your agents

## Testing Changes

After building, you can test the server directly:

```bash
# Set environment variable
export AGENTS_DIR="/path/to/your/agents"

# Run the server
node dist/index.js
```

The server will start and wait for MCP protocol messages on stdin.

## Multiple Environments

You can have different configurations for different projects:

**Personal Projects** (`.cursor/mcp.json` in home directory):
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": ["/Users/nickmisasi/workspace/sub-agents-mcp"],
      "env": {
        "AGENTS_DIR": "/Users/nickmisasi/personal-agents"
      }
    }
  }
}
```

**Work Projects** (`.cursor/mcp.json` in work repo):
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": ["/Users/nickmisasi/workspace/sub-agents-mcp"],
      "env": {
        "AGENTS_DIR": "/Users/nickmisasi/work/project-name/agents",
        "AGENT_TYPE": "claude"
      }
    }
  }
}
```

This way, each project can have its own set of specialized agents!

## Multiple Clients Running Simultaneously

**Can I test with multiple clients at once (e.g., Cursor + Claude Desktop)?**

Yes! Each MCP client automatically gets its own isolated server instance:

- Each client runs `npx /path/to/sub-agents-mcp` → spawns its own Node.js process
- MCP uses stdio (stdin/stdout) for communication, which is inherently 1:1
- No conflicts or shared state between instances

**Testing scenario:**
1. Configure the same local path in both Cursor's `~/.cursor/mcp.json` and Claude Desktop's `~/Library/Application Support/Claude/claude_desktop_config.json`
2. Start both applications
3. Both will work independently, each with their own server process
4. You can use agents from both clients simultaneously

**Important notes:**
- Each instance loads agents at startup
- To see agent changes, restart the client (triggers server reload)
- Both instances read from the same `AGENTS_DIR` (which is fine)
- No shared state between server instances (stateless by design)

## Troubleshooting

### Server Not Starting
- Check that the build succeeded: `ls -la dist/index.js`
- Verify the path in your MCP config is absolute and correct
- Check logs: Set `LOG_LEVEL: "debug"` in env

### Agents Not Found
- Verify `AGENTS_DIR` is an absolute path
- Check that the directory contains `.md` or `.txt` files
- Look at server logs for discovery errors

### Changes Not Reflecting
- Rebuild: `npm run build`
- Restart your IDE/MCP client
- Check that you're pointing to the correct `dist/index.js` file

## Updating the Code

When you make changes to the code:

```bash
cd /Users/nickmisasi/workspace/sub-agents-mcp
npm run build
# Then restart your IDE
```

That's it! The MCP client will automatically pick up the new version.

