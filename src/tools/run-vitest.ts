/* eslint-disable no-console */
/* eslint-disable id-blacklist */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { dirname, resolve } from 'path'

// Debug logging function that writes to file to avoid MCP protocol interference
function debugLog(message: string, data?: any) {
  if (process.env.DEBUG_MCP !== 'true') return

  const timestamp = new Date().toISOString()
  const logMessage = data
    ? `[RUN-VITEST ${timestamp}] ${message}: ${JSON.stringify(data, null, 2)}\n`
    : `[RUN-VITEST ${timestamp}] ${message}\n`

  try {
    require('fs').appendFileSync('/tmp/vitest-mcp-debug.log', logMessage)
  } catch (error) {
    // Silently fail if we can't write to log file
  }
}

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
      debugLog('========== RUN-VITEST TOOL CALLED ==========')
      debugLog('Arguments received', args)
      debugLog('Process CWD', process.cwd())
      debugLog('VITEST_PROJECT_DIR env', process.env.VITEST_PROJECT_DIR || 'UNDEFINED')

      // Temporary debug mode - return early with debug info
      const isDebugMode =
        args &&
        typeof args === 'object' &&
        'random_string' in args &&
        args.random_string === 'debug'
      if (isDebugMode) {
        return {
          content: [
            {
              type: 'text',
              text: `DEBUG INFO - EARLY RETURN:
Process CWD: ${process.cwd()}
VITEST_PROJECT_DIR: ${process.env.VITEST_PROJECT_DIR || 'UNDEFINED'}
Arguments: ${JSON.stringify(args)}
Node version: ${process.version}
Args type: ${typeof args}
random_string value: ${args.random_string}
All environment vars containing VITEST: ${JSON.stringify(
                Object.keys(process.env)
                  .filter(k => k.includes('VITEST'))
                  .reduce((acc: Record<string, string>, k) => {
                    acc[k] = process.env[k] || ''
                    return acc
                  }, {})
              )}`,
            },
          ],
        }
      }

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
          debugLog('Starting Vitest in directory', projectDir)
          debugLog('Current working directory', process.cwd())

          // Run vitest as child process to get JSON output
          const vitestOutput = await new Promise<string>((resolve, reject) => {
            const vitestProcess = spawn(
              'npx',
              ['vitest', '--run', '--reporter=json', '--no-coverage', '--pool=threads'],
              {
                cwd: projectDir,
                stdio: ['ignore', 'pipe', 'pipe'],
                env: {
                  ...process.env,
                  NODE_ENV: 'test',
                  // Disable slower features for speed
                  CI: 'true', // Often makes vitest faster
                  VITEST_SEGFAULT_RETRY: '0', // Disable retry mechanisms
                },
              }
            )

            let stdout = ''
            let stderr = ''
            let outputComplete = false

            vitestProcess.stdout.on('data', data => {
              stdout += data.toString()

              // Check if JSON output is complete
              // Look for key indicators: testResults field and proper JSON ending
              const hasTestResults = stdout.includes('"testResults":[')
              const hasProperEnding = stdout.trim().endsWith(']}')
              const hasValidStructure =
                stdout.includes('"numTotalTests":') &&
                stdout.includes('"numPassedTests":')

              // Only consider it complete if we have substantial output and proper structure
              if (
                hasTestResults &&
                hasProperEnding &&
                hasValidStructure &&
                stdout.length > 500
              ) {
                debugLog('Vitest JSON output complete, terminating process', {
                  length: stdout.length,
                })
                if (!outputComplete) {
                  outputComplete = true
                  clearTimeout(timeout)
                  vitestProcess.kill('SIGTERM')
                  setTimeout(() => {
                    resolve(stdout)
                  }, 50) // Minimal delay for clean termination
                }
              }
            })

            vitestProcess.stderr.on('data', data => {
              stderr += data.toString()
              debugLog('vitest stderr', data.toString())
            })

            // Shorter timeout since we'll kill process once output is complete
            const timeout = setTimeout(() => {
              debugLog('Killing vitest process after 15 second timeout')
              vitestProcess.kill('SIGKILL')
              if (!outputComplete) {
                reject(
                  new Error(
                    `Vitest execution timeout after 15 seconds. Debug: projectDir=${projectDir}, cwd=${process.cwd()}, env.VITEST_PROJECT_DIR=${process.env.VITEST_PROJECT_DIR}, stdout.length=${stdout.length}, stderr.length=${stderr.length}`
                  )
                )
              }
            }, 15000)

            vitestProcess.on('close', code => {
              if (!outputComplete) {
                clearTimeout(timeout)
                debugLog('Vitest process exited naturally with code', code)

                if (code === 0 || code === 1) {
                  // 0 = success, 1 = tests failed but ran successfully
                  resolve(stdout)
                } else {
                  reject(
                    new Error(`Vitest failed with exit code ${code}. stderr: ${stderr}`)
                  )
                }
              }
            })

            vitestProcess.on('error', error => {
              clearTimeout(timeout)
              reject(new Error(`Failed to start vitest: ${error.message}`))
            })
          })

          debugLog('Vitest completed, parsing output...')

          // Parse the JSON output
          let results: any
          try {
            results = JSON.parse(vitestOutput)
            debugLog(`Found ${results.numTotalTests} total tests`)
          } catch (error) {
            debugLog('Failed to parse JSON output', vitestOutput.substring(0, 500))
            throw new Error(`Failed to parse vitest output as JSON: ${error}`)
          }

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
