# Sub-Agents MCP Server [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

This project was originally forked from: https://github.com/shinpr/sub-agents-mcp. I've made a bunch of adjustments in order to better fit my workflow.


Bring Claude Code–style sub-agents to any MCP-compatible tool.

This MCP server lets you define task-specific AI agents (like "test-writer" or "code-reviewer") in markdown files, and execute them via Cursor CLI or Claude Code CLI backends.

## Why?

Claude Code offers powerful sub-agent workflows—but they're limited to its own environment. This MCP server makes that workflow portable, so any MCP-compatible tool (Cursor, Claude Desktop, Windsurf, etc.) can use the same agents.

**Concrete benefits:**
- Define reusable agents once, use them across multiple tools
- Share agent definitions within teams regardless of IDE choice
- Leverage Cursor CLI or Claude Code CLI capabilities from any MCP client

→ [Read the full story](https://dev.to/shinpr/bringing-claude-codes-sub-agents-to-any-mcp-compatible-tool-1hb9)

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Usage Examples](#usage-examples)
- [Agent Examples](#agent-examples)
- [Configuration Reference](#configuration-reference)
- [Troubleshooting](#troubleshooting)
- [Multiple Clients & Concurrent Usage](#multiple-clients--concurrent-usage)
- [Design Philosophy](#design-philosophy)
- [How It Works](#how-it-works)

## Prerequisites

- Node.js 20 or higher
- One of these execution engines (they actually run the sub-agents):
  - `cursor-agent` CLI (from Cursor)
  - `claude` CLI (from Claude Code)
- An MCP-compatible tool (Cursor IDE, Claude Desktop, Windsurf, etc.)

## Quick Start

### 1. Create Your First Agent

Create a folder for your agents and add `code-reviewer.md`:

```markdown
# Code Reviewer

You are a specialized AI assistant that reviews code.
Focus on:
- Finding bugs and potential issues
- Suggesting improvements
- Checking code quality
```

### 2. Install Your Execution Engine

Pick one based on which tool you use:

**For Cursor users:**
```bash
# Install Cursor CLI (includes cursor-agent)
curl https://cursor.com/install -fsS | bash

# Authenticate (required before first use)
cursor-agent login
```

**For Claude Code users:**
```bash
# Option 1: Native install (recommended)
curl -fsSL https://claude.ai/install.sh | bash

# Option 2: NPM (requires Node.js 18+)
npm install -g @anthropic-ai/claude-code
```

Note: Claude Code installs the `claude` CLI command.

### 3. Configure MCP

Add this to your MCP configuration file:

**Cursor:** `~/.cursor/mcp.json`
**Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": ["-y", "sub-agents-mcp"],
      "env": {
        "AGENTS_DIR": "/absolute/path/to/your/agents-folder",
        "AGENT_TYPE": "cursor"  // or "claude"
      }
    }
  }
}
```

**Important:** Use absolute paths only.
- ✅ `/Users/john/Documents/my-agents` (Mac/Linux)
- ✅ `C:\\Users\\john\\Documents\\my-agents` (Windows)
- ❌ `./agents` or `~/agents` won't work

Restart your IDE and you're ready to go.

### 4. Fix "Permission Denied" Errors When Running Shell Commands

Sub-agents may fail to execute shell commands with permission errors. This happens because sub-agents can't respond to interactive permission prompts.

**Recommended approach:**

1. Run your CLI tool directly with the task you want sub-agents to handle:
   ```bash
   # For Cursor users
   cursor-agent

   # For Claude Code users
   claude
   ```

2. When prompted to allow commands (e.g., "Add Shell(cd), Shell(make) to allowlist?"), approve them

3. This automatically updates your configuration file, and those commands will now work when invoked via MCP sub-agents

**Manual configuration (alternative):**

If you prefer to configure permissions manually, edit:
- **Cursor**: `<project>/.cursor/cli.json` or `~/.cursor/cli-config.json`
- **Claude Code**: `.claude/settings.json` or `.claude/settings.local.json`

```json
{
  "permissions": {
    "allow": [
      "Shell(cd)",
      "Shell(make)",
      "Shell(git)"
    ]
  }
}
```

Note: Agents often run commands as one-liners like `cd /path && make build`, so you need to allow all parts of the command.

## Usage Examples

Each agent is exposed as its own MCP tool. Just tell your AI to use the agent:

```
"Use the agent_code-reviewer tool to check my UserService class"
```

```
"Use the agent_test-writer tool to create unit tests for the auth module"
```

```
"Use the agent_doc-writer tool to add JSDoc comments to all public methods"
```

Your AI automatically invokes the specialized agent and returns results.

### Advanced: Custom Output Instructions

You can control how agents format their responses:

```
"Use the agent_code-reviewer tool with output_instructions set to 'Return only a JSON array of issues'"
```

If you don't specify output_instructions, agents will provide a brief summary of what they accomplished and suggest next steps.

## Agent Examples

Each `.md` or `.txt` file in your agents folder becomes an MCP tool:
- Filename: `test-writer.md` → Tool: `agent_test-writer`
- Filename: `code-reviewer.md` → Tool: `agent_code-reviewer`

### Test Writer

**`test-writer.md`**
```markdown
# Test Writer
You specialize in writing comprehensive unit tests.
- Cover edge cases
- Follow project testing patterns
- Ensure good coverage
```

### SQL Expert

**`sql-expert.md`**
```markdown
# SQL Expert
You're a database specialist who helps with queries.
- Optimize for performance
- Suggest proper indexes
- Help with complex JOINs
```

### Security Checker

**`security-checker.md`**
```markdown
# Security Checker
You focus on finding security vulnerabilities.
- Check for SQL injection risks
- Identify authentication issues
- Find potential data leaks
```

## Configuration Reference

### Required Environment Variables

**`AGENTS_DIR`**
Path to your agents folder. Must be absolute.

**`AGENT_TYPE`**
Which execution engine to use:
- `"cursor"` - uses `cursor-agent` CLI
- `"claude"` - uses `claude` CLI

### Optional Settings

**`EXECUTION_TIMEOUT_MS`**
How long agents can run before timing out (default: 5 minutes, max: 10 minutes)

Example with timeout:
```json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": ["-y", "sub-agents-mcp"],
      "env": {
        "AGENTS_DIR": "/absolute/path/to/agents",
        "AGENT_TYPE": "cursor",
        "EXECUTION_TIMEOUT_MS": "600000"
      }
    }
  }
}
```

### Security Note

Agents have access to your project directory. Only use agent definitions from trusted sources.

## Troubleshooting

### Timeout errors or authentication failures

**If using Cursor CLI:**
Run `cursor-agent login` to authenticate. Sessions can expire, so just run this command again if you see auth errors.

Verify installation:
```bash
which cursor-agent
```

**If using Claude Code:**
Make sure the CLI is properly installed and accessible.

### Agent not found

Check that:
- `AGENTS_DIR` points to the correct directory (use absolute path)
- Your agent file has `.md` or `.txt` extension
- The filename uses hyphens or underscores (no spaces)

### Other execution errors

1. Verify `AGENT_TYPE` is set correctly (`cursor` or `claude`)
2. Ensure your chosen CLI tool is installed and accessible
3. Double-check that all environment variables are set in the MCP config

## Multiple Clients & Concurrent Usage

**Can I use this with multiple tools at once?**

Yes! You can have Cursor, Claude Desktop, and any other MCP clients all using the same `sub-agents-mcp` configuration simultaneously. Each client automatically gets its own isolated server instance.

**How it works:**
- Each MCP client spawns its own `sub-agents-mcp` process via `npx`
- MCP servers use **stdio** (stdin/stdout) for communication, which is inherently 1:1
- When Cursor starts → it runs `npx sub-agents-mcp` → gets process A
- When Claude Code starts → it runs `npx sub-agents-mcp` → gets process B
- These processes are completely independent

**What this means:**
- ✅ No conflicts between clients
- ✅ No port binding or resource contention
- ✅ Each client sees the same agents from your `AGENTS_DIR`
- ✅ Agents can run in parallel across different clients
- ℹ️ Each instance loads agents at startup (restart client to reload changes)
- ℹ️ No shared state between instances (stateless by design)

**Example:**
```json
// Same config in both ~/.cursor/mcp.json AND ~/Library/Application Support/Claude/claude_desktop_config.json
{
  "mcpServers": {
    "sub-agents": {
      "command": "npx",
      "args": ["-y", "sub-agents-mcp"],
      "env": {
        "AGENTS_DIR": "/Users/you/shared-agents",
        "AGENT_TYPE": "cursor"
      }
    }
  }
}
```

Both Cursor and Claude Desktop will work perfectly at the same time, each with their own server process.

## Design Philosophy

### Why Independent Contexts Matter

Every sub-agent starts with a fresh context. This adds some startup overhead for each call, but it ensures that every task runs independently and without leftover state from previous runs.

**Context Isolation**
- Each agent only receives the information relevant to its task
- No context leakage between runs
- The main agent stays focused and lightweight

**Accuracy and Reliability**
- Sub-agents can specialize in a single goal without interference
- Less risk of confusion from unrelated context
- More consistent results in complex, multi-step workflows

**Scalability**
- Large tasks can be safely split into smaller sub-tasks
- Each sub-agent operates within its own token limit
- The main agent coordinates without hitting global context limits

The startup overhead is an intentional trade-off: the system favors clarity and accuracy over raw execution speed.

## How It Works

This MCP server acts as a bridge between your AI tool and a supported execution engine (Cursor CLI or Claude Code CLI).

**The flow:**

1. You configure the MCP server in your client (Cursor, Claude Desktop, etc.)
2. The client automatically launches `sub-agents-mcp` as a background process when it starts
3. When your main AI assistant needs a sub-agent, it makes an MCP tool call
4. The MCP server reads the agent definition (markdown file) and invokes the selected CLI (`cursor-agent` or `claude`)
5. The execution engine runs the agent and streams results back through the MCP server
6. Your main assistant receives the results and continues working

This architecture lets any MCP-compatible tool benefit from specialized sub-agents, even if it doesn't have native support.

## License

MIT

---

*AI-to-AI collaboration through Model Context Protocol*
