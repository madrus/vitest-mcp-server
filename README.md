# Vitest MCP Server

![vitest mcp server ad](./assets/vitest-mcp-server.png)

A **production-ready** Model Context Protocol (MCP) server for running Vitest tests and analyzing coverage. This server provides AI assistants with intelligent tools for test-driven development workflows.

---

## 🚀 Features

- **Health Check Tool** - Server connectivity verification
- **Test Execution Tool** - Run Vitest tests with complete results
- **Coverage Analysis Tool** - Detailed coverage reports with uncovered line analysis
- **Intelligent Resources** - Access test results and coverage data as resources
- **Smart Caching** - Automatic result caching for seamless data flow
- **Auto-Discovery** - Automatically finds your Vitest configuration
- **Robust Execution** - Fixed JSON parsing and execution reliability (v1.0.5)

---

## 🛠️ Usage

### How it can be useful for local development

If your project uses Vitest, you can ask your AI agent in Cursor, Claude Desktop, or any other MCP-compatible editor these kinds of questions:
1. Run my unit tests. Check if there are any errors, and if so, fix them. Repeat this process until all unit tests pass.
2. Analyze the code coverage and identify the three most important files that have coverage below 80%. Then add the missing unit tests by examining the uncovered lines. Repeat this process until the coverage for these files exceeds 80% and all unit tests pass.

### Integration with AI Assistants

Configure your AI assistant (like Claude Desktop, Cursor, etc.) to use this MCP server in the usual way. On top of that the server needs to know the path to your project root in order to be able to find your Vitest config file.

#### Why This MCP Server Needs Environment Variables

**Unlike many other MCP servers**, this one executes Vitest commands that must run in your specific project directory. Here's why:

- **Most MCP servers** just analyze files, make API calls, or provide static information
- **This MCP server** actually executes `vitest run` and `vitest --coverage` commands
- **Vitest requires** its working directory to be your project root to find:
  - `vitest.config.ts/js`
  - `package.json`
  - Test files
  - Source files for coverage analysis
- **MCP servers run** in their own process/directory, not your project directory
- **Without `VITEST_PROJECT_DIR`**, Vitest can't find your config and fails

#### Optimized Configuration (Recommended)

For best performance and reliability, use only the environment variable (the `cwd` is redundant):

```json
{
  "mcpServers": {
    "vitest-runner": {
      "command": "npx",
      "args": [
        "-y",
        "@madrus/vitest-mcp-server@latest"
      ],
      "env": {
        "VITEST_PROJECT_DIR": "/Users/<your-username>/path/to/your/project/root"
      }
    }
  }
}
```

#### Configuration Locations

**Cursor (macOS/Linux):**
- File: `~/.cursor/mcp.json`
- Full path: `/Users/<your-username>/.cursor/mcp.json`

**Claude Desktop (macOS):**
- File: `~/Library/Application Support/Claude/claude_desktop_config.json`

**Claude Desktop (Windows):**
- File: `%APPDATA%\Claude\claude_desktop_config.json`

#### Example Complete Configuration

Here's a complete example for Cursor with multiple MCP servers:

```json
{
  "mcpServers": {
    "vitest-runner": {
      "command": "npx",
      "args": [
        "-y",
        "@madrus/vitest-mcp-server@latest"
      ],
      "env": {
        "VITEST_PROJECT_DIR": "/Users/<your-username>/path/to/your/project/root"
      }
    }
  }
}
```

#### Important Setup Notes

1. **Replace placeholders**: Change `/Users/<your-username>/path/to/your/project/root` to your actual project path
2. **Project root**: The path should point to your project's root directory (where `package.json` and Vitest config files are located)
3. **Restart required**: After updating your MCP configuration, restart your AI assistant (Cursor, Claude Desktop, etc.)
4. **Verify setup**: Use the `ping` tool to verify the server is working correctly

#### Testing and Troubleshooting

**Testing with MCP Inspector:**

You can use the MCP Inspector to visually test the server's tools and resources before integrating with your AI assistant:

```bash
npx @modelcontextprotocol/inspector npx -y @madrus/vitest-mcp-server@latest
```

This opens a web interface where you can test the `ping`, `run-vitest`, and `run-vitest-coverage` tools interactively and view the available resources.

**Common Issues and Solutions:**

1. **Server fails to start or times out:**
   - Check that your project path in `VITEST_PROJECT_DIR` is correct and absolute
   - Verify the path exists and contains `package.json`
   - Try running `npx vitest run` manually in your project directory

2. **"Cannot find vitest config" errors:**
   - Ensure your project has a `vitest.config.ts/js` or `vite.config.ts/js` file
   - Check that Vitest is installed in your project: `npm list vitest`
   - Verify the config file is in the directory specified by `VITEST_PROJECT_DIR`

---

## 🔧 Available Tools

### `ping`
Simple health check that returns "pong". Useful for verifying server connectivity.

**Returns:** `"pong"`

### `run-vitest`
Executes Vitest tests and returns structured results.

**Parameters:**
- `projectDir` (optional): Override auto-detected project directory

**Features:**
- Auto-detects project directory by looking for `vitest.config.ts`
- Returns JSON-formatted test results with detailed test information
- Caches results for resource access
- Handles test failures gracefully

**Returns:** Complete test execution results including:
- Test suite summaries
- Individual test results
- Timing information
- Pass/fail statistics

### `run-vitest-coverage`
Executes Vitest tests with comprehensive coverage analysis.

**Parameters:**
- `projectDir` (optional): Override auto-detected project directory

**Features:**
- **Fixed in v1.0.5**: Now properly executes tests AND generates coverage
- Comprehensive coverage analysis with file-by-file breakdown
- Line-by-line uncovered code detection with line numbers
- Smart formatting with status indicators (✅ Perfect, ⚠️ Partial, ❌ No coverage)
- Coverage data caching for subsequent analysis
- Handles large codebases efficiently

**Returns:** Test results + detailed coverage data including:
- Per-file coverage percentages
- Uncovered line ranges
- Coverage status summaries
- Branch and function coverage

---

## 📚 Available Resources

After running tests, the following resources become available:

### `vitest://test-results`
Complete test execution results in JSON format.

### `vitest://coverage-report`
Detailed coverage analysis with file-by-file metrics.

### `vitest://test-summary`
Human-readable test summary with success percentages.

---

## 📊 Example Coverage Output

```json
{
  "numTotalTests": 167,
  "numPassedTests": 167,
  "numFailedTests": 0,
  "coverage": {
    "app/components/AppBar.tsx": {
      "summary": {
        "lines": {"pct": 95.78, "total": 166, "covered": 159},
        "functions": {"pct": 33.33, "total": 3, "covered": 1},
        "statements": {"pct": 95.78, "total": 166, "covered": 159},
        "branches": {"pct": 84.21, "total": 19, "covered": 16}
      },
      "status": "⚠️ 7 lines uncovered",
      "uncoveredLines": "43-44, 49-50, 52, 63-64",
      "totalUncoveredLines": 7
    },
    "app/components/AuthErrorBoundary.tsx": {
      "summary": {
        "lines": {"pct": 100, "total": 64, "covered": 64},
        "functions": {"pct": 100, "total": 3, "covered": 3},
        "statements": {"pct": 100, "total": 64, "covered": 64},
        "branches": {"pct": 100, "total": 17, "covered": 17}
      },
      "status": "✅ Perfect coverage",
      "uncoveredLines": "none",
      "totalUncoveredLines": 0
    }
  }
}
```

---

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
2. Environment variable: `VITEST_PROJECT_DIR` (recommended)
3. Auto-detection (default, may not work in all MCP setups)

### Environment Variables

| Variable             | Description                                                                                                                                                                                                               | Required | Default       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| `VITEST_PROJECT_DIR` | **HIGHLY RECOMMENDED**: Specifies your project directory since MCP servers run in isolated processes. Unlike other MCPs that just analyze files, this one executes Vitest commands that need to run in your project root. | No       | Auto-detected |
| `NODE_ENV`           | Set automatically to `test` during execution. You don't need to set this manually.                                                                                                                                        | No       | `test`        |

---

## 📈 Recent Improvements

### v1.0.8 (Latest)
- **📦 Optimized npm package size**: Reduced bundle size by ~60% (46.6kB → 19.2kB)
- **🧹 Excluded test files from production bundle**: Tests no longer included in published package
- **⚡ Faster installs**: Significantly reduced download size for `npx` usage
- **🔧 Fixed .npmignore format**: Corrected file format and added comprehensive exclusions

### v1.0.6-v1.0.7
- **📝 Updated documentation (this file)**

### v1.0.5
- **🔧 Fixed coverage tool execution**: Now properly runs tests AND generates coverage
- **🔧 Fixed JSON parsing errors**: Resolved malformed JSON output from coverage commands
- **📊 Enhanced coverage reporting**: Better formatting and status indicators
- **🚀 Improved reliability**: More robust error handling and timeouts

### v1.0.4
- **🔧 Fixed test execution**: Switched from programmatic API to spawn-based execution
- **📝 Better error reporting**: More detailed error messages and debugging info

### v1.0.3 and earlier
- Basic test execution and coverage tools
- Initial MCP server implementation

---

## 🏗️ Requirements

- Node.js ≥ 22.0.0
- Vitest ≥ 3.0.0
- A Vitest configuration file in your project
- AI assistant with MCP support (Cursor, Claude Desktop, etc.)

---

## 📄 License

MIT

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

---

## 🐛 Issues

If you encounter any issues, please report them on the [GitHub Issues](https://github.com/madrus/vitest-mcp-server/issues) page.

---

## 🙏 Acknowledgments

Built with the [Model Context Protocol SDK](https://github.com/modelcontextprotocol/sdk) and designed for seamless integration with AI-powered development workflows.
