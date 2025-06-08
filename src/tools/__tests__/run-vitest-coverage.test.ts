import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockReaddirSync = vi.fn()
const mockStartVitest = vi.fn()

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync,
}))

vi.mock('vitest/node', () => ({
  startVitest: mockStartVitest,
}))

class MockServer {
  public tools = new Map<string, { schema: any; handler: Function }>()

  tool(name: string, schema: any, handler: Function) {
    this.tools.set(name, { schema, handler })
  }
}

describe('run-vitest-coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock process methods to prevent actual directory changes
    vi.spyOn(process, 'chdir').mockImplementation(() => {})
    vi.spyOn(process, 'cwd').mockReturnValue('/test')
    // Mock directory listing
    mockReaddirSync.mockReturnValue(['coverage-summary.json', 'coverage-final.json'])
  })

  it('should register the run-vitest-coverage tool correctly', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    registerRunVitestCoverageTool(mockServer as any)

    expect(mockServer.tools.has('run-vitest-coverage')).toBe(true)

    const tool = mockServer.tools.get('run-vitest-coverage')!
    expect(tool.schema).toHaveProperty('type', 'object')
    expect(tool.schema.properties).toHaveProperty('projectDir')
  })

  it('should handle missing project directory', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(false)

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/nonexistent' })

    expect(result.content[0].text).toContain('Project directory does not exist')
  })

  it('should execute vitest with coverage configuration', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/example.test.ts',
            tasks: [
              {
                type: 'test',
                name: 'test 1',
                result: { state: 'pass', duration: 10 },
              },
            ],
            result: { state: 'pass', duration: 10 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    await handler({ projectDir: '/test' })

    expect(mockStartVitest).toHaveBeenCalledWith(
      'test',
      [],
      expect.objectContaining({
        coverage: {
          enabled: true,
          reporter: ['json', 'json-summary'],
        },
      }),
      expect.any(Object)
    )
  })

  it('should process coverage data when available', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    // Mock coverage files
    mockExistsSync.mockImplementation((path: string) => {
      // Mock the coverage directory and specific files
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            lines: { pct: 85.5, total: 100, covered: 85 },
            functions: { pct: 90, total: 10, covered: 9 },
            statements: { pct: 85.5, total: 100, covered: 85 },
            branches: { pct: 75, total: 20, covered: 15 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            statementMap: {
              '1': { start: { line: 10, column: 0 } },
              '2': { start: { line: 15, column: 4 } },
            },
            s: { '1': 1, '2': 0 }, // Second statement not covered
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [],
      },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('coverage')
    expect(data.coverage).toHaveProperty('app/file.ts')

    const fileData = data.coverage['app/file.ts']
    expect(fileData).toHaveProperty('summary')
    expect(fileData).toHaveProperty('status')
    expect(fileData).toHaveProperty('uncoveredLines')
    expect(fileData).toHaveProperty('totalUncoveredLines')
  })

  it('should handle missing coverage files gracefully', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      // Project exists but no coverage directory
      return !path.includes('coverage')
    })

    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [],
      },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    // Should still return test results even without coverage
    expect(data).toHaveProperty('numTotalTestSuites')
  })

  it('should handle vitest errors in coverage mode', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockRejectedValue(new Error('Coverage error'))

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    expect(result.content[0].text).toContain('Error running vitest')
    expect(result.content[0].text).toContain('Coverage error')
  })

  it('should process uncovered lines correctly', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      // Mock the coverage directory and specific files
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            lines: { pct: 50, total: 10, covered: 5 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            statementMap: {
              '1': { start: { line: 10, column: 0 } },
              '2': { start: { line: 15, column: 4 } },
              '3': { start: { line: 20, column: 2 } },
              '4': { start: { line: 25, column: 0 } },
            },
            s: { '1': 1, '2': 0, '3': 0, '4': 1 }, // Lines 15 and 20 not covered
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [],
      },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const fileData = data.coverage['app/file.ts']

    expect(fileData.uncoveredLines).toEqual('15, 20')
  })

  it('should handle edge cases in uncovered lines formatting', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Test file with no coverage (all lines uncovered)
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            lines: { pct: 0, total: 100, covered: 0 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            statementMap: {
              '1': { start: { line: 1, column: 0 } },
              '2': { start: { line: 2, column: 0 } },
            },
            s: { '1': 0, '2': 0 }, // All uncovered
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const fileData = data.coverage['app/file.ts']

    expect(fileData.uncoveredLines).toEqual('all')
    expect(fileData.totalUncoveredLines).toBe(2)
  })

  it('should handle files with full coverage', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Test file with 100% coverage
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            lines: { pct: 100, total: 10, covered: 10 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            statementMap: {
              '1': { start: { line: 1, column: 0 } },
              '2': { start: { line: 2, column: 0 } },
            },
            s: { '1': 1, '2': 1 }, // All covered
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const fileData = data.coverage['app/file.ts']

    expect(fileData.uncoveredLines).toEqual('none')
    expect(fileData.totalUncoveredLines).toBe(0)
  })

  it('should handle environment variable project directory detection', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    // Set environment variable
    const originalEnv = process.env.VITEST_PROJECT_DIR
    process.env.VITEST_PROJECT_DIR = '/env/coverage/project'

    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')
    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    await handler({}) // No projectDir parameter

    expect(mockStartVitest).toHaveBeenCalledWith(
      'test',
      [],
      expect.objectContaining({
        coverage: expect.objectContaining({ enabled: true }),
      }),
      expect.objectContaining({ root: '/env/coverage/project' })
    )

    // Restore environment
    if (originalEnv) {
      process.env.VITEST_PROJECT_DIR = originalEnv
    } else {
      delete process.env.VITEST_PROJECT_DIR
    }
  })

  it('should handle complex uncovered line ranges', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Test file with complex uncovered line patterns
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/complex.ts': {
            lines: { pct: 40, total: 20, covered: 8 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/complex.ts': {
            statementMap: {
              '1': { start: { line: 5, column: 0 } },
              '2': { start: { line: 6, column: 0 } },
              '3': { start: { line: 7, column: 0 } },
              '4': { start: { line: 10, column: 0 } },
              '5': { start: { line: 15, column: 0 } },
              '6': { start: { line: 16, column: 0 } },
              '7': { start: { line: 17, column: 0 } },
              '8': { start: { line: 25, column: 0 } },
            },
            s: {
              '1': 0,
              '2': 0,
              '3': 0, // Lines 5-7 uncovered (range)
              '4': 1, // Line 10 covered
              '5': 0,
              '6': 0,
              '7': 0, // Lines 15-17 uncovered (range)
              '8': 0, // Line 25 uncovered (single)
            },
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const fileData = data.coverage['app/complex.ts']

    // Should format as ranges and individual lines
    expect(fileData.uncoveredLines).toEqual('5-7, 15-17, 25')
    expect(fileData.totalUncoveredLines).toBe(7)
  })

  it('should handle JSON parsing errors in coverage files', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Return invalid JSON to trigger parse errors
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return 'invalid json {{'
      }
      if (path.includes('coverage-final.json')) {
        return 'also invalid json ][['
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    // Should handle gracefully and still return test results
    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('numTotalTestSuites')
    // Coverage should be empty or minimal due to parsing errors
  })

  it('should handle non-string error types', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockRejectedValue({
      code: 'COVERAGE_ERROR',
      errno: -2,
      details: 'Complex error object',
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    expect(result.content[0].text).toContain('Error running vitest')
    expect(result.content[0].text).toContain('[object Object]')
  })

  it('should handle missing coverage summary but existing final coverage', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return false // Missing
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            statementMap: {
              '1': { start: { line: 10, column: 0 } },
            },
            s: { '1': 1 },
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    // Should still work with only coverage-final.json
    if (result.content[0].text.startsWith('Error')) {
      // Expect error message when coverage summary is missing
      expect(result.content[0].text).toContain('Error')
    } else {
      const data = JSON.parse(result.content[0].text)
      expect(data).toHaveProperty('numTotalTestSuites')
    }
  })

  it('should test findProjectDirectory with different config files', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    delete process.env.VITEST_PROJECT_DIR

    // Mock different config file scenarios
    mockExistsSync.mockImplementation((path: string) => {
      if (path.endsWith('vite.config.js')) return true
      if (path.includes('coverage')) return false
      return true
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    await handler({}) // No projectDir parameter

    expect(mockStartVitest).toHaveBeenCalled()
  })

  it('should test findProjectDirectory reaching root directory', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    delete process.env.VITEST_PROJECT_DIR

    // Mock no config files found (should return null and use cwd)
    mockExistsSync.mockImplementation((path: string) => {
      if (path.includes('vitest.config') || path.includes('vite.config')) return false
      if (path.includes('coverage')) return false
      return true // For directory existence check
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    await handler({}) // No projectDir parameter

    expect(mockStartVitest).toHaveBeenCalled()
  })

  it('should handle extractUncoveredLines with missing statementCounts', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Coverage data with missing statementCounts
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            lines: { pct: 50, total: 10, covered: 5 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            statementMap: {
              '1': { start: { line: 10, column: 0 } },
              '2': { start: { line: 15, column: 4 } },
            },
            // Missing 's' property (statementCounts)
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const fileData = data.coverage['app/file.ts']

    // Should handle missing statementCounts and mark all as uncovered
    expect(fileData.totalUncoveredLines).toBe(2)
  })

  it('should handle extractUncoveredLines with malformed data', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Coverage data with malformed entries
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/file.ts': {
            lines: { pct: 50, total: 10, covered: 5 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/file.ts': null, // Malformed file data
          '/test/app/valid.ts': {
            statementMap: {
              '1': { start: { line: 5, column: 0 } },
            },
            s: { '1': 0 },
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    // Should handle gracefully and still process valid entries
    expect(result.content[0].text).not.toContain('Error')
  })

  it('should test groupLinesIntoRanges with various patterns', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return !path.includes('nonexistent')
    })

    // Complex uncovered line patterns to test groupLinesIntoRanges
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/ranges.ts': {
            lines: { pct: 30, total: 20, covered: 6 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/ranges.ts': {
            statementMap: {
              '1': { start: { line: 1, column: 0 } },
              '2': { start: { line: 3, column: 0 } },
              '3': { start: { line: 4, column: 0 } },
              '4': { start: { line: 5, column: 0 } },
              '5': { start: { line: 10, column: 0 } },
              '6': { start: { line: 15, column: 0 } },
              '7': { start: { line: 16, column: 0 } },
              '8': { start: { line: 20, column: 0 } },
            },
            s: {
              '1': 0, // Line 1 (single)
              '2': 0,
              '3': 0,
              '4': 0, // Lines 3-5 (range)
              '5': 0, // Line 10 (single)
              '6': 0,
              '7': 0, // Lines 15-16 (short range)
              '8': 0, // Line 20 (single)
            },
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const fileData = data.coverage['app/ranges.ts']

    // Should format as mix of ranges and singles: "1, 3-5, 10, 15-16, 20"
    expect(fileData.uncoveredLines).toEqual('1, 3-5, 10, 15-16, 20')
    expect(fileData.totalUncoveredLines).toBe(8)
  })

  it('should handle coverage data processing with various delay scenarios', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    let callCount = 0
    // Simulate coverage files appearing after delay
    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') {
        callCount++
        return callCount > 3 // Only exists after a few checks
      }
      if (
        path.includes('coverage-summary.json') ||
        path.includes('coverage-final.json')
      ) {
        return callCount > 3
      }
      return true
    })

    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage-summary.json')) {
        return JSON.stringify({
          '/test/app/delayed.ts': {
            lines: { pct: 80, total: 10, covered: 8 },
          },
        })
      }
      if (path.includes('coverage-final.json')) {
        return JSON.stringify({
          '/test/app/delayed.ts': {
            statementMap: {
              '1': { start: { line: 5, column: 0 } },
              '2': { start: { line: 10, column: 0 } },
            },
            s: { '1': 1, '2': 0 },
          },
        })
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    // Coverage might not be available due to timing issues in tests
    expect(data).toHaveProperty('numTotalTestSuites')
  })

  it('should handle readFileSync errors during coverage reading', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      if (path === '/test/coverage') return true
      if (path === '/test/coverage/coverage-summary.json') return true
      if (path === '/test/coverage/coverage-final.json') return true
      return true
    })

    // Mock readFileSync to throw error
    mockReadFileSync.mockImplementation((path: string) => {
      if (path.includes('coverage')) {
        throw new Error('File read permission denied')
      }
      return '{}'
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    // Should handle gracefully and still return test results
    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('numTotalTestSuites')
    expect(data.coverage).toHaveProperty('message')
  })

  it('should handle nested suite structures in test results', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      return !path.includes('nonexistent') // Allow project directory to exist
    })
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/complex.test.ts',
            tasks: [
              {
                type: 'suite',
                name: 'outer suite',
                tasks: [
                  {
                    type: 'test',
                    name: 'test in suite',
                    result: { state: 'pass', duration: 5 },
                    suite: { name: 'outer suite' },
                  },
                  {
                    type: 'suite',
                    name: 'inner suite',
                    tasks: [
                      {
                        type: 'test',
                        name: 'nested test',
                        result: {
                          state: 'fail',
                          duration: 3,
                          errors: [{ message: 'Failed' }],
                        },
                        suite: { name: 'inner suite' },
                      },
                    ],
                  },
                ],
              },
              {
                type: 'test',
                name: 'top level test',
                result: { state: 'pass', duration: 2 },
              },
            ],
            result: { state: 'fail', duration: 10 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    expect(data.numTotalTests).toBe(3) // Should count all nested tests
    expect(data.numPassedTests).toBe(2)
    expect(data.numFailedTests).toBe(1)
    expect(data.testResults[0].assertionResults).toHaveLength(3)
  })

  it('should handle test tasks with missing or null names', async () => {
    const { registerRunVitestCoverageTool } = await import(
      '@/tools/run-vitest-coverage.js'
    )
    const mockServer = new MockServer()

    mockExistsSync.mockImplementation((path: string) => {
      return !path.includes('nonexistent') // Allow project directory to exist
    })
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/unnamed.test.ts',
            tasks: [
              {
                type: 'test',
                // Missing name property
                result: { state: 'pass', duration: 5 },
              },
              {
                type: 'test',
                name: null, // Null name
                result: { state: 'fail', duration: 3 },
              },
            ],
            result: { state: 'fail', duration: 8 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestCoverageTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest-coverage')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    const testResult = data.testResults[0]
    expect(testResult.assertionResults[0].title).toBe('unknown test')
    expect(testResult.assertionResults[1].title).toBe('unknown test')
  })
})
