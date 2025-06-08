# Vitest MCP Server

A **sophisticated** Model Context Protocol (MCP) server for running Vitest tests and analyzing coverage. This server provides AI assistants with intelligent tools for test-driven development workflows.

## 🚀 Features

- **Health Check Tool** - Server connectivity verification
- **Test Execution Tool** - Run Vitest tests with complete results
- **Coverage Analysis Tool** - Detailed coverage reports with uncovered line analysis
- **Intelligent Resources** - Access test results and coverage data as resources
- **Smart Caching** - Automatic result caching for seamless data flow
- **Auto-Discovery** - Automatically finds your Vitest configuration

## 📦 Installation

```bash
npm install @madrus/vitest-mcp-server
```

## 🛠️ Usage

### As a Standalone MCP Server

```bash
# Run the server directly
npx @madrus/vitest-mcp-server

# Or if installed globally
vitest-mcp-server
```

### Integration with AI Assistants

Configure your AI assistant (like Claude, Cursor, etc.) to use this MCP server:

```json
{
  "mcpServers": {
    "vitest": {
      "command": "npx",
      "args": ["@madrus/vitest-mcp-server"]
    }
  }
}
```

### Programmatic Usage

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerRunVitestTool, registerRunVitestCoverageTool } from '@madrus/vitest-mcp-server/tools'

const server = new McpServer(
  { name: 'my-server', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {} } }
)

// Register the tools
registerRunVitestTool(server)
registerRunVitestCoverageTool(server)
```

## 🔧 Available Tools

### `ping`
Simple health check that returns "pong". Useful for verifying server connectivity.

### `run-vitest`
Executes Vitest tests and returns structured results.

**Parameters:**
- `projectDir` (optional): Override auto-detected project directory

**Features:**
- Auto-detects project directory by looking for `vitest.config.ts`
- Returns JSON-formatted test results
- Caches results for resource access

### `run-vitest-coverage`
Executes Vitest tests with coverage analysis.

**Parameters:**
- `projectDir` (optional): Override auto-detected project directory

**Features:**
- Comprehensive coverage analysis
- Line-by-line uncovered code detection
- Smart formatting with status indicators
- Coverage data caching

## 📚 Available Resources

After running tests, the following resources become available:

### `vitest://test-results`
Complete test execution results in JSON format.

### `vitest://coverage-report`
Detailed coverage analysis with file-by-file metrics.

### `vitest://test-summary`
Human-readable test summary with success percentages.

## 📊 Example Coverage Output

```json
{
  "coverage": {
    "src/components/Button.tsx": {
      "summary": {
        "lines": {"pct": 95.78, "total": 166, "covered": 159},
        "functions": {"pct": 33.33, "total": 3, "covered": 1},
        "statements": {"pct": 95.78, "total": 166, "covered": 159},
        "branches": {"pct": 84.21, "total": 19, "covered": 16}
      },
      "status": "⚠️ 7 lines uncovered",
      "uncoveredLines": "43-44, 49-50, 52, 63-64",
      "totalUncoveredLines": 7
    }
  }
}
```

## 🔧 Configuration

### Project Detection

The server automatically detects your Vitest configuration by looking for:
- `vitest.config.ts`
- `vitest.config.js`
- `vitest.config.mjs`
- `vite.config.ts`
- `vite.config.js`
- `vite.config.mjs`

You can override the project directory using:
1. Tool parameter: `projectDir`
2. Environment variable: `VITEST_PROJECT_DIR`
3. Auto-detection (default)

### Environment Variables

| Variable             | Description                                                                                                       | Required | Default       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| `VITEST_PROJECT_DIR` | Override the auto-detected project directory. Useful when the server can't find your Vitest config automatically. | No       | Auto-detected |
| `NODE_ENV`           | Set automatically to `test` during execution. You don't need to set this manually.                                | No       | `test`        |

**Example usage:**
```bash
# Override project directory
VITEST_PROJECT_DIR=/path/to/your/project npx @madrus/vitest-mcp-server

# Or export it
export VITEST_PROJECT_DIR=/path/to/your/project
npx @madrus/vitest-mcp-server
```

## 🏗️ Requirements

- Node.js ≥ 18.0.0
- Vitest ≥ 2.0.0
- A Vitest configuration file in your project

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🐛 Issues

If you encounter any issues, please report them on the [GitHub Issues](https://github.com/madrus/vitest-mcp-server/issues) page.
