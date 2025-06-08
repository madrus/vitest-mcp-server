#!/usr/bin/env node
// If you get import errors, check node_modules/@modelcontextprotocol/sdk/server/ for the correct paths
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { registerRunVitestCoverageTool } from './tools/run-vitest-coverage.js'
import { registerRunVitestTool } from './tools/run-vitest.js'

// Cache for storing latest test results and coverage data
let latestTestResults: any = null
let latestCoverageResults: any = null

async function main() {
  const server = new McpServer(
    {
      name: 'vitest-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
        resources: {},
      },
    }
  )

  // Resource: Test Results
  server.resource('latest-test-results', 'vitest://test-results', async () => {
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
  server.tool('ping', {}, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }))

  // Register the vitest tools with result caching
  registerRunVitestTool(server)
  registerRunVitestCoverageTool(server)

  // Add result caching by wrapping the existing tools
  const originalTools = (server as any)._tools || new Map()

  if (originalTools.has('run-vitest')) {
    const originalHandler = originalTools.get('run-vitest')
    server.tool('run-vitest', originalHandler.schema, async (...args: any[]) => {
      const result = await originalHandler.handler(...args)

      // Cache the results for resource access
      if (result.content && result.content[0]?.text) {
        try {
          latestTestResults = JSON.parse(result.content[0].text)
        } catch (e) {
          latestTestResults = { rawOutput: result.content[0].text }
        }
      }

      return result
    })
  }

  if (originalTools.has('run-vitest-coverage')) {
    const originalHandler = originalTools.get('run-vitest-coverage')
    server.tool(
      'run-vitest-coverage',
      originalHandler.schema,
      async (...args: any[]) => {
        const result = await originalHandler.handler(...args)

        // Cache the results for resource access
        if (result.content && result.content[0]?.text) {
          try {
            const coverageData = JSON.parse(result.content[0].text)
            latestCoverageResults = coverageData
            // Also update test results if included
            if (coverageData.numTotalTests !== undefined) {
              latestTestResults = coverageData
            }
          } catch (e) {
            latestCoverageResults = { rawOutput: result.content[0].text }
          }
        }

        return result
      }
    )
  }

  // Start the server using stdio transport
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(error => {
  console.error('Server error:', error)
  process.exit(1)
})
