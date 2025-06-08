import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
const mockExistsSync = vi.fn()
const mockStartVitest = vi.fn()

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
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

describe('run-vitest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock process methods to prevent actual directory changes
    vi.spyOn(process, 'chdir').mockImplementation(() => {})
    vi.spyOn(process, 'cwd').mockReturnValue('/test')
  })

  it('should register the run-vitest tool correctly', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    registerRunVitestTool(mockServer as any)

    expect(mockServer.tools.has('run-vitest')).toBe(true)

    const tool = mockServer.tools.get('run-vitest')!
    expect(tool.schema).toHaveProperty('type', 'object')
    expect(tool.schema.properties).toHaveProperty('projectDir')
  })

  it('should handle missing project directory', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(false)

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/nonexistent' })

    expect(result.content[0].text).toContain('Project directory does not exist')
  })

  it('should handle vitest startup failure', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue(null)

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    expect(result.content[0].text).toContain('Failed to start Vitest')
  })

  it('should handle successful test execution', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
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

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    expect(result.content[0].type).toBe('text')
    const data = JSON.parse(result.content[0].text)
    expect(data).toHaveProperty('numTotalTestSuites', 1)
    expect(data).toHaveProperty('numPassedTestSuites', 1)
    expect(data).toHaveProperty('testResults')
  })

  it('should handle vitest errors', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockRejectedValue(new Error('Config error'))

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    expect(result.content[0].text).toContain('Error running vitest')
    expect(result.content[0].text).toContain('Config error')
  })

  it('should process test results with failures correctly', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/failing.test.ts',
            tasks: [
              {
                type: 'test',
                name: 'passing test',
                result: { state: 'pass', duration: 5 },
              },
              {
                type: 'test',
                name: 'failing test',
                result: {
                  state: 'fail',
                  duration: 3,
                  errors: [{ message: 'Test failed' }],
                },
              },
            ],
            result: { state: 'fail', duration: 8 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    expect(data.numTotalTestSuites).toBe(1)
    expect(data.numFailedTestSuites).toBe(1)
    expect(data.numPassedTestSuites).toBe(0)
    expect(data.numTotalTests).toBe(2)
    expect(data.numPassedTests).toBe(1)
    expect(data.numFailedTests).toBe(1)

    const testResult = data.testResults[0]
    expect(testResult.status).toBe('failed')
    expect(testResult.assertionResults).toHaveLength(2)
    expect(testResult.assertionResults[0].status).toBe('passed')
    expect(testResult.assertionResults[1].status).toBe('failed')
  })

  it('should handle environment variable for project directory', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    // Mock environment variable
    const originalEnv = process.env.VITEST_PROJECT_DIR
    process.env.VITEST_PROJECT_DIR = '/env/project'

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    await handler({}) // No projectDir parameter

    expect(mockStartVitest).toHaveBeenCalledWith(
      'test',
      [],
      expect.any(Object),
      expect.objectContaining({ root: '/env/project' })
    )

    // Restore original environment
    if (originalEnv) {
      process.env.VITEST_PROJECT_DIR = originalEnv
    } else {
      delete process.env.VITEST_PROJECT_DIR
    }
  })

  it('should auto-detect project directory using findProjectDirectory', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    delete process.env.VITEST_PROJECT_DIR

    // Mock the file system to simulate auto-detection
    mockExistsSync.mockImplementation((path: string) => {
      if (path.endsWith('vitest.config.ts')) return true
      return true // For the final existence check
    })

    mockStartVitest.mockResolvedValue({
      state: { getFiles: () => [] },
      close: vi.fn(),
    })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    await handler({}) // No projectDir parameter, no env var

    expect(mockStartVitest).toHaveBeenCalled()
  })

  it('should handle nested test suites', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/nested.test.ts',
            tasks: [
              {
                type: 'suite',
                name: 'outer suite',
                tasks: [
                  {
                    type: 'test',
                    name: 'nested test 1',
                    result: { state: 'pass', duration: 5 },
                    suite: { name: 'outer suite' },
                  },
                  {
                    type: 'suite',
                    name: 'inner suite',
                    tasks: [
                      {
                        type: 'test',
                        name: 'deeply nested test',
                        result: { state: 'pass', duration: 3 },
                        suite: { name: 'inner suite' },
                      },
                    ],
                  },
                ],
              },
            ],
            result: { state: 'pass', duration: 8 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    expect(data.numTotalTests).toBe(2) // Should count nested tests
    expect(data.numPassedTests).toBe(2)

    const testResult = data.testResults[0]
    expect(testResult.assertionResults).toHaveLength(2)
  })

  it('should handle empty test files', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/empty.test.ts',
            tasks: [], // Empty tasks array
            result: { state: 'pass', duration: 0 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    expect(data.numTotalTestSuites).toBe(1)
    expect(data.numPassedTestSuites).toBe(0) // Empty file doesn't count as passed
    expect(data.numTotalTests).toBe(0)
  })

  it('should handle tests with missing results', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockResolvedValue({
      state: {
        getFiles: () => [
          {
            filepath: '/test/incomplete.test.ts',
            tasks: [
              {
                type: 'test',
                name: 'test without result',
                // Missing result property
              },
              {
                type: 'test',
                name: 'test with null result',
                result: null,
              },
            ],
            result: { state: 'fail', duration: 0 },
          },
        ],
      },
      close: vi.fn(),
    })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    const data = JSON.parse(result.content[0].text)
    expect(data.numTotalTests).toBe(2)
    expect(data.numFailedTests).toBe(2) // Tests without results count as failed
  })

  it('should handle non-string error handling', async () => {
    const { registerRunVitestTool } = await import('@/tools/run-vitest.js')
    const mockServer = new MockServer()

    mockExistsSync.mockReturnValue(true)
    mockStartVitest.mockRejectedValue({ code: 'SOME_ERROR', details: 'complex error' })

    registerRunVitestTool(mockServer as any)
    const handler = mockServer.tools.get('run-vitest')!.handler

    const result = await handler({ projectDir: '/test' })

    expect(result.content[0].text).toContain('Error running vitest')
    expect(result.content[0].text).toContain('[object Object]')
  })
})
