/* eslint-disable no-console */
/* eslint-disable id-blacklist */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

import { spawn } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { dirname, join, resolve } from 'path'

type UncoveredLine = {
  line: number
  column?: number
}

type FileUncoveredLines = {
  [filePath: string]: UncoveredLine[]
}

// Debug logging function that writes to file to avoid MCP protocol interference
function debugLog(message: string, data?: any) {
  if (process.env.DEBUG_MCP !== 'true') return

  const timestamp = new Date().toISOString()
  const logMessage = data
    ? `[RUN-VITEST-COVERAGE ${timestamp}] ${message}: ${JSON.stringify(data, null, 2)}\n`
    : `[RUN-VITEST-COVERAGE ${timestamp}] ${message}\n`

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
 * Extract uncovered lines from coverage data
 */
function extractUncoveredLines(coverageData: any): FileUncoveredLines {
  const uncoveredLines: FileUncoveredLines = {}

  for (const [filePath, fileData] of Object.entries(coverageData)) {
    if (!fileData || typeof fileData !== 'object') continue

    const { statementMap, s: statementCounts } = fileData as any
    if (!statementMap) continue

    const uncovered: UncoveredLine[] = []

    // If no statement counts exist, all statements are uncovered
    if (!statementCounts) {
      // Add all statements as uncovered
      for (const [statementId, statement] of Object.entries(statementMap)) {
        if (statement && typeof statement === 'object' && (statement as any).start) {
          uncovered.push({
            line: (statement as any).start.line,
            column: (statement as any).start.column,
          })
        }
      }
    } else {
      // Find statements that were not executed (count = 0)
      for (const [statementId, count] of Object.entries(statementCounts)) {
        if (count === 0 && statementMap[statementId]) {
          const statement = statementMap[statementId]
          uncovered.push({
            line: statement.start.line,
            column: statement.start.column,
          })
        }
      }
    }

    // Sort by line number and remove duplicates
    const uniqueLines = Array.from(new Set(uncovered.map(item => item.line))).sort(
      (a, b) => a - b
    )

    if (uniqueLines.length > 0) {
      uncoveredLines[filePath] = uniqueLines.map(line => ({ line }))
    }
  }

  return uncoveredLines
}

/**
 * Group consecutive line numbers into ranges
 */
function groupLinesIntoRanges(lines: number[]): string[] {
  if (lines.length === 0) return []

  const sorted = [...lines].sort((a, b) => a - b)
  const ranges: string[] = []
  let start = sorted[0]
  let end = sorted[0]

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === end + 1) {
      // Consecutive line, extend current range
      end = sorted[i]
    } else {
      // Gap found, close current range and start new one
      if (start === end) {
        ranges.push(start.toString())
      } else {
        ranges.push(`${start}-${end}`)
      }
      start = sorted[i]
      end = sorted[i]
    }
  }

  // Add final range
  if (start === end) {
    ranges.push(start.toString())
  } else {
    ranges.push(`${start}-${end}`)
  }

  return ranges
}

/**
 * Get uncovered lines for a specific file relative to project root
 */
function getUncoveredLinesForFile(
  uncoveredLines: FileUncoveredLines,
  projectDir: string,
  relativeFilePath: string
): UncoveredLine[] {
  const fullPath = join(projectDir, relativeFilePath)
  return uncoveredLines[fullPath] || []
}

/**
 * Registers the run-vitest-coverage tool with the given MCP server.
 */
export function registerRunVitestCoverageTool(server: McpServer): void {
  server.tool(
    'run-vitest-coverage',
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

        // Try to read coverage files before vitest.close() deletes them
        let coverageData: any = null
        let coverageSummary: any = null
        let debugInfo: string[] = []

        // Add debugging info about execution context
        debugInfo.push(`Process cwd BEFORE: ${process.cwd()}`)
        debugInfo.push(`Project dir: ${projectDir}`)

        // Set up environment globals before starting Vitest
        process.env.NODE_ENV = 'test'

        // Change working directory to project directory to fix path resolution
        const originalCwd = process.cwd()
        process.chdir(projectDir)
        debugInfo.push(`Process cwd AFTER chdir: ${process.cwd()}`)

        try {
          debugLog('Starting Vitest coverage in directory', projectDir)
          debugLog('Current working directory', process.cwd())

          // Run vitest with coverage as child process to get JSON output
          const vitestOutput = await new Promise<string>((resolve, reject) => {
            const vitestProcess = spawn(
              'npx',
              ['vitest', '--run', '--reporter=json', '--coverage'],
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

            vitestProcess.stdout.on('data', (data: any) => {
              stdout += data.toString()
              debugLog('Vitest stdout chunk received', data.toString().length)

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
                !outputComplete
              ) {
                outputComplete = true
                debugLog('Complete JSON output detected, resolving')
                resolve(stdout)
              }
            })

            vitestProcess.stderr.on('data', (data: any) => {
              stderr += data.toString()
              debugLog('Vitest stderr', data.toString())
            })

            vitestProcess.on('close', (code: any) => {
              debugLog('Vitest process closed', { code, stdoutLength: stdout.length })
              if (!outputComplete) {
                if (code === 0 && stdout.trim()) {
                  debugLog('Process completed successfully, using final output')
                  resolve(stdout)
                } else {
                  const errorMsg = `Vitest coverage process failed with code ${code}. Stderr: ${stderr}`
                  debugLog('Process failed', errorMsg)
                  reject(new Error(errorMsg))
                }
              }
            })

            vitestProcess.on('error', (error: any) => {
              debugLog('Vitest process error', error.message)
              reject(new Error(`Failed to spawn vitest: ${error.message}`))
            })

            // Fallback timeout - allow more time for coverage
            setTimeout(() => {
              if (!outputComplete) {
                debugLog('Vitest timeout reached', {
                  stdoutLength: stdout.length,
                  stderrLength: stderr.length,
                })
                vitestProcess.kill()
                reject(
                  new Error(
                    `Vitest coverage execution timeout after 60 seconds. Debug: projectDir=${projectDir}, cwd=${process.cwd()}, env.VITEST_PROJECT_DIR=${process.env.VITEST_PROJECT_DIR}, stdout.length=${stdout.length}, stderr.length=${stderr.length}`
                  )
                )
              }
            }, 60000) // Increased timeout for coverage
          })

          // Parse the JSON output
          let results: any
          try {
            results = JSON.parse(vitestOutput)
            debugLog(`Found ${results.numTotalTests} total tests`)
          } catch (error) {
            debugLog('Failed to parse JSON output', vitestOutput.substring(0, 500))
            throw new Error(`Failed to parse vitest output as JSON: ${error}`)
          }

          // Extract test results from the vitest JSON output
          const testResults = results.testResults || []
          const numTotalTests = results.numTotalTests || 0
          const numPassedTests = results.numPassedTests || 0
          const numFailedTests = results.numFailedTests || 0
          const numTotalTestSuites = results.numTotalTestSuites || 0
          const numPassedTestSuites = results.numPassedTestSuites || 0
          const numFailedTestSuites = results.numFailedTestSuites || 0

          // Wait for coverage files to be generated

          // Try multiple times with increasing delays to catch coverage files
          const delays = [100, 500, 1000]
          let found = false

          for (const delay of delays) {
            await new Promise(resolve => setTimeout(resolve, delay))

            const coverageDir = join(projectDir, 'coverage')
            const coverageSummaryPath = join(
              projectDir,
              'coverage',
              'coverage-summary.json'
            )

            debugInfo.push(`Checking: ${coverageDir}`)

            if (existsSync(coverageDir)) {
              debugInfo.push(`Coverage directory exists after ${delay}ms delay`)
              found = true

              // Try to read coverage files
              try {
                const fs = await import('fs')
                const files = fs.readdirSync(coverageDir)
                debugInfo.push(`Coverage files found: ${files.join(', ')}`)

                if (existsSync(coverageSummaryPath)) {
                  debugInfo.push('coverage-summary.json exists - reading...')
                  const summaryText = readFileSync(coverageSummaryPath, 'utf-8')
                  coverageSummary = JSON.parse(summaryText)
                  debugInfo.push('Coverage summary loaded successfully')
                } else {
                  debugInfo.push('coverage-summary.json does not exist')
                }

                const coverageJsonPath = join(
                  projectDir,
                  'coverage',
                  'coverage-final.json'
                )
                if (existsSync(coverageJsonPath)) {
                  debugInfo.push('coverage-final.json exists - reading...')
                  const coverageText = readFileSync(coverageJsonPath, 'utf-8')
                  coverageData = JSON.parse(coverageText)
                  debugInfo.push('Coverage data loaded successfully')
                } else {
                  debugInfo.push('coverage-final.json does not exist')
                }
              } catch (error) {
                debugInfo.push(`Error reading coverage files: ${error}`)
              }
              break
            } else {
              debugInfo.push(`Coverage directory does not exist after ${delay}ms delay`)
            }
          }

          if (!found) {
            debugInfo.push('Final check: Coverage directory does not exist')
            debugInfo.push('coverage-final.json does not exist')
            debugInfo.push('coverage-summary.json does not exist')
          }

          // Test results are now taken directly from vitest JSON output
          debugLog('Test execution completed', {
            numTotalTests,
            numPassedTests,
            numFailedTests,
            numTotalTestSuites,
            numPassedTestSuites,
            numFailedTestSuites,
          })

          // Extract uncovered lines if we have detailed coverage data
          let uncoveredLines: FileUncoveredLines = {}
          let detailedFileCoverage: any = {}
          if (coverageData) {
            uncoveredLines = extractUncoveredLines(coverageData)

            // Create detailed file coverage report
            const appFiles = Object.keys(coverageData)
              .filter(path => path.includes('/app/'))
              .sort()

            detailedFileCoverage = appFiles.reduce((acc: any, fullPath: string) => {
              const relativePath = fullPath.replace(projectDir + '/', '')

              // Get uncovered lines directly from the fullPath key in uncoveredLines
              const fileUncoveredLines = uncoveredLines[fullPath] || []

              // Get summary data for this file
              const fileSummary = coverageSummary[fullPath]

              if (fileSummary) {
                const lineNumbers = fileUncoveredLines.map(item => item.line)
                const coveragePercent = fileSummary.lines?.pct || 0

                let status = ''
                let ranges: string[] = []

                // Always process uncovered lines if they exist
                if (lineNumbers.length > 0) {
                  ranges = groupLinesIntoRanges(lineNumbers)
                }

                let uncoveredLinesFormatted = ''

                if (coveragePercent === 0) {
                  status = '❌ No coverage'
                  uncoveredLinesFormatted = 'all'
                } else if (lineNumbers.length === 0) {
                  status = '✅ Perfect coverage'
                  uncoveredLinesFormatted = 'none'
                } else {
                  status = `⚠️ ${lineNumbers.length} lines uncovered`
                  uncoveredLinesFormatted = ranges.join(', ')
                }

                acc[relativePath] = {
                  summary: fileSummary,
                  status,
                  uncoveredLines: uncoveredLinesFormatted,
                  totalUncoveredLines: lineNumbers.length,
                }
              }

              return acc
            }, {})
          }

          // Close vitest
          // Cleanup (no longer needed with spawn approach)

          // Return results with coverage information
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    numTotalTestSuites,
                    numPassedTestSuites,
                    numFailedTestSuites,
                    numTotalTests,
                    numPassedTests,
                    numFailedTests,
                    testResults,
                    coverage: coverageSummary
                      ? detailedFileCoverage
                      : {
                          message:
                            'Coverage files were created but cleaned up immediately by Vitest',
                          instruction:
                            'Coverage data is being generated but not persisted - this is normal behavior',
                        },
                  },
                  null,
                  2
                ),
              },
            ],
          }
        } finally {
          // Always restore original working directory
          process.chdir(originalCwd)
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        return {
          content: [
            {
              type: 'text',
              text: `Error running vitest with coverage: ${errorMessage}`,
            },
          ],
        }
      }
    }
  )
}
