#!/usr/bin/env node
// If you get import errors, check node_modules/@modelcontextprotocol/sdk/server/ for the correct paths
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { registerRunVitestCoverageTool } from './tools/run-vitest-coverage.js'
import { registerRunVitestTool } from './tools/run-vitest.js'

// Debug logging function that only logs when DEBUG_MCP environment variable is explicitly set to "true"
// Uses a log file instead of stderr to avoid interfering with MCP protocol
function debugLog(message: string, data?: any) {
  if (process.env.DEBUG_MCP !== 'true') return

  const timestamp = new Date().toISOString()
  const logMessage = data
    ? `[DEBUG ${timestamp}] ${message}: ${JSON.stringify(data, null, 2)}\n`
    : `[DEBUG ${timestamp}] ${message}\n`

  // Write to a log file instead of stderr to avoid protocol interference
  try {
    require('fs').appendFileSync('/tmp/vitest-mcp-debug.log', logMessage)
  } catch (error) {
    // Silently fail if we can't write to log file
  }
}

// Cache for storing latest test results and coverage data
let latestTestResults: any = null
let latestCoverageResults: any = null

async function main() {
  debugLog('=== VITEST MCP SERVER STARTING ===')
  debugLog('Node version', process.version)
  debugLog('Working directory', process.cwd())
  debugLog('Environment variables', {
    NODE_ENV: process.env.NODE_ENV,
    VITEST_PROJECT_DIR: process.env.VITEST_PROJECT_DIR,
    PWD: process.env.PWD,
    DEBUG_MCP: process.env.DEBUG_MCP,
  })

  const server = new McpServer(
    {
      name: 'vitest-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        logging: {}, // Enable logging capability
      },
    }
  )

  debugLog('MCP Server created with capabilities')

  // Resource: Test Results
  server.resource('latest-test-results', 'vitest://test-results', async () => {
    debugLog('Resource request: latest-test-results')
    if (!latestTestResults) {
      throw new Error("No test results available. Run 'run-vitest' tool first.")
    }
    return {
      contents: [
        {
          uri: 'vitest://test-results',
          mimeType: 'application/json',
          text: JSON.stringify(latestTestResults, null, 2),
        },
      ],
    }
  })

  // Resource: Coverage Report
  server.resource('latest-coverage-report', 'vitest://coverage-report', async () => {
    debugLog('Resource request: latest-coverage-report')
    if (!latestCoverageResults) {
      throw new Error(
        "No coverage results available. Run 'run-vitest-coverage' tool first."
      )
    }
    return {
      contents: [
        {
          uri: 'vitest://coverage-report',
          mimeType: 'application/json',
          text: JSON.stringify(latestCoverageResults, null, 2),
        },
      ],
    }
  })

  // Resource: Test Summary
  server.resource('test-summary', 'vitest://test-summary', async () => {
    debugLog('Resource request: test-summary')
    if (!latestTestResults) {
      throw new Error("No test results available. Run 'run-vitest' tool first.")
    }

    const summary = `Test Summary
=============
Total Suites: ${latestTestResults.numTotalTestSuites}
Passed Suites: ${latestTestResults.numPassedTestSuites}
Failed Suites: ${latestTestResults.numFailedTestSuites}

Total Tests: ${latestTestResults.numTotalTests}
Passed Tests: ${latestTestResults.numPassedTests}
Failed Tests: ${latestTestResults.numFailedTests}

Success Rate: ${(
      (latestTestResults.numPassedTests / latestTestResults.numTotalTests) *
      100
    ).toFixed(1)}%`

    return {
      contents: [
        {
          uri: 'vitest://test-summary',
          mimeType: 'text/plain',
          text: summary,
        },
      ],
    }
  })

  // Health check tool
  server.tool('ping', {}, async () => {
    debugLog('Tool called: ping')
    const response = 'pong'
    debugLog('Ping response', response)
    return {
      content: [
        {
          type: 'text',
          text: response,
        },
      ],
    }
  })

  // Register the vitest tools with enhanced logging
  debugLog('Registering vitest tools...')
  registerRunVitestTool(server)
  registerRunVitestCoverageTool(server)
  debugLog('Vitest tools registered successfully')

  // TODO: Add result caching in a future version
  // The complex caching wrapper was causing crashes due to accessing private server properties

  debugLog('Creating STDIO transport...')
  // Start the server using stdio transport
  const transport = new StdioServerTransport()

  // Add transport event listeners for debugging
  transport.onclose = () => {
    debugLog('Transport closed')
  }

  transport.onerror = (error: Error) => {
    debugLog('Transport error', error.message)
  }

  debugLog('Connecting server to transport...')
  await server.connect(transport)
  debugLog('=== VITEST MCP SERVER CONNECTED AND READY ===')
}

main().catch(error => {
  debugLog('FATAL SERVER ERROR', {
    message: error.message,
    stack: error.stack,
    name: error.name,
  })
  // Only log to stderr in case of fatal errors
  console.error('Server error:', error)
  process.exit(1)
})
