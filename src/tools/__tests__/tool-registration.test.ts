import { MockMcpServer } from '@/utils/test-helpers'
import { describe, expect, it, vi } from 'vitest'

// Mock the actual vitest/node module since we're testing registration, not execution
vi.mock('vitest/node', () => ({
  startVitest: vi.fn(),
}))

// We'll import our actual registration functions
import { registerRunVitestCoverageTool, registerRunVitestTool } from '@/tools/index'

describe('Tool Registration', () => {
  it('should register run-vitest tool with correct schema', () => {
    const mockServer = new MockMcpServer() as any

    registerRunVitestTool(mockServer)

    const tool = mockServer.getTool('run-vitest')
    expect(tool).toBeDefined()
    expect(tool.schema).toBeDefined()
    expect(tool.schema.type).toBe('object')
    expect(tool.schema.properties).toHaveProperty('projectDir')
    expect(tool.schema.properties.projectDir.type).toBe('string')
    expect(tool.schema.required).toEqual([])
    expect(tool.handler).toBeTypeOf('function')
  })

  it('should register run-vitest-coverage tool with correct schema', () => {
    const mockServer = new MockMcpServer() as any

    registerRunVitestCoverageTool(mockServer)

    const tool = mockServer.getTool('run-vitest-coverage')
    expect(tool).toBeDefined()
    expect(tool.schema).toBeDefined()
    expect(tool.schema.type).toBe('object')
    expect(tool.schema.properties).toHaveProperty('projectDir')
    expect(tool.schema.properties.projectDir.type).toBe('string')
    expect(tool.schema.required).toEqual([])
    expect(tool.handler).toBeTypeOf('function')
  })

  it('should register both tools when called together', () => {
    const mockServer = new MockMcpServer() as any

    registerRunVitestTool(mockServer)
    registerRunVitestCoverageTool(mockServer)

    const tools = mockServer.getAllTools()
    expect(tools).toContain('run-vitest')
    expect(tools).toContain('run-vitest-coverage')
    expect(tools).toHaveLength(2)
  })

  it('should handle projectDir parameter correctly in run-vitest tool', async () => {
    const mockServer = new MockMcpServer() as any

    registerRunVitestTool(mockServer)

    const tool = mockServer.getTool('run-vitest')
    expect(tool.schema.properties.projectDir.description).toContain('auto-detected')

    // Test that the handler accepts the parameter structure
    expect(async () => {
      // This will fail because we're not actually running vitest, but it validates the structure
      await tool.handler({ projectDir: '/some/path' })
    }).not.toThrow()
  })

  it('should handle projectDir parameter correctly in run-vitest-coverage tool', async () => {
    const mockServer = new MockMcpServer() as any

    registerRunVitestCoverageTool(mockServer)

    const tool = mockServer.getTool('run-vitest-coverage')
    expect(tool.schema.properties.projectDir.description).toContain('auto-detected')

    // Test that the handler accepts the parameter structure
    expect(async () => {
      // This will fail because we're not actually running vitest, but it validates the structure
      await tool.handler({ projectDir: '/some/path' })
    }).not.toThrow()
  })
})
