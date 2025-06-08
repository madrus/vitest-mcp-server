/* eslint-disable no-console */
/* eslint-disable id-blacklist */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { startVitest } from 'vitest/node'

import { existsSync } from 'fs'
import { dirname, resolve } from 'path'

/**
 * Auto-detect the project directory by looking for vitest.config.ts
 * Searches from current working directory up the directory tree
 */
function findProjectDirectory(startDir: string = process.cwd()): string | null {
  let currentDir = resolve(startDir)
  const root = resolve('/')

  while (currentDir !== root) {
    // Look for vitest config files
    const vitestConfigs = [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mjs',
      'vite.config.ts',
      'vite.config.js',
      'vite.config.mjs',
    ]

    for (const config of vitestConfigs) {
      if (existsSync(resolve(currentDir, config))) {
        return currentDir
      }
    }

    // Move up one directory
    currentDir = dirname(currentDir)
  }

  return null
}

/**
 * Registers the run-vitest tool with the given MCP server.
 */
export function registerRunVitestTool(server: McpServer): void {
  server.tool(
    'run-vitest',
    {
      type: 'object',
      properties: {
        projectDir: {
          type: 'string',
          description: 'Override the auto-detected project directory',
        },
      },
      required: [],
      additionalProperties: false,
    },
    async args => {
      try {
        // Determine the project directory with multiple fallback strategies
        let projectDir: string | null = null

        // 1. Use provided parameter
        if (args.projectDir && typeof args.projectDir === 'string') {
          projectDir = resolve(args.projectDir)
        }

        // 2. Use environment variable
        if (!projectDir && process.env.VITEST_PROJECT_DIR) {
          projectDir = resolve(process.env.VITEST_PROJECT_DIR)
        }

        // 3. Auto-detect from current working directory
        if (!projectDir) {
          projectDir = findProjectDirectory()
        }

        // 4. Use current working directory as last resort
        if (!projectDir) {
          projectDir = process.cwd()
        }

        // Validate that the project directory exists
        if (!existsSync(projectDir)) {
          return {
            content: [
              {
                type: 'text',
                text: `Error: Project directory does not exist: ${projectDir}`,
              },
            ],
          }
        }

        // Set up environment globals before starting Vitest
        process.env.NODE_ENV = 'test'

        // Change working directory to project root for proper config resolution
        const originalCwd = process.cwd()
        process.chdir(projectDir)

        try {
          // Start Vitest programmatically using the Node.js API
          // Use minimal overrides to let vitest.config.ts do the work
          const vitest = await startVitest(
            'test', // mode
            [], // files - empty means all files
            {
              // CLI options only
              watch: false,
              run: true,
              reporters: ['json'],
            },
            {
              // Minimal vite config - let vitest.config.ts handle everything
              root: projectDir,
              logLevel: 'silent',
            }
          )

          if (!vitest) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Failed to start Vitest in directory: ${projectDir}. Please ensure vitest.config.ts exists and is properly configured.`,
                },
              ],
            }
          }

          // Get test results from vitest state
          const testFiles = vitest.state.getFiles()

          // Helper function to determine if a file passed
          const isFilePassed = (file: any) => {
            // A file passes if all its tests pass (no failed tests)
            const allTasks = file.tasks || []
            if (allTasks.length === 0) return false
            return allTasks.every((task: any) => task.result?.state === 'pass')
          }

          // Helper function to get all test tasks recursively (including nested suites)
          const getAllTasks = (items: any[]): any[] => {
            const tasks: any[] = []
            for (const item of items) {
              if (item.type === 'test') {
                tasks.push(item)
              } else if (item.type === 'suite' && item.tasks) {
                tasks.push(...getAllTasks(item.tasks))
              }
            }
            return tasks
          }

          // Create a summary object similar to JSON reporter output
          const results = {
            numTotalTestSuites: testFiles.length,
            numPassedTestSuites: testFiles.filter(isFilePassed).length,
            numFailedTestSuites: testFiles.filter(f => !isFilePassed(f)).length,
            numTotalTests: testFiles.reduce(
              (sum, f) => sum + getAllTasks(f.tasks || []).length,
              0
            ),
            numPassedTests: 0,
            numFailedTests: 0,
            testResults: testFiles.map(file => {
              const allTasks = getAllTasks(file.tasks || [])
              const passedTasks = allTasks.filter(t => t.result?.state === 'pass')
              const failedTasks = allTasks.filter(t => t.result?.state === 'fail')

              return {
                name: file.filepath,
                status: isFilePassed(file) ? 'passed' : 'failed',
                duration: file.result?.duration || 0,
                assertionResults: allTasks.map(task => ({
                  ancestorTitles: task.suite ? [task.suite.name] : [],
                  title: task.name,
                  status: task.result?.state === 'pass' ? 'passed' : 'failed',
                  duration: task.result?.duration || 0,
                  failureMessages:
                    task.result?.errors?.map((e: any) => e.message) || [],
                })),
              }
            }),
          }

          // Count total passed/failed tests
          results.numPassedTests = results.testResults.reduce(
            (sum, r) =>
              sum + r.assertionResults.filter(a => a.status === 'passed').length,
            0
          )
          results.numFailedTests = results.testResults.reduce(
            (sum, r) =>
              sum + r.assertionResults.filter(a => a.status === 'failed').length,
            0
          )

          // Close vitest
          await vitest.close()

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(results, null, 2),
              },
            ],
          }
        } finally {
          // Restore original working directory
          process.chdir(originalCwd)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: 'text',
              text: `Error running vitest: ${errorMessage}`,
            },
          ],
        }
      }
    }
  )
}
