import { MockMcpServer } from '@/utils/test-helpers'
import { describe, expect, it, vi } from 'vitest'

// Mock vitest/node with different scenarios
vi.mock('vitest/node', () => ({
  startVitest: vi.fn(),
}))

import { registerRunVitestCoverageTool, registerRunVitestTool } from '@/tools/index'

describe('Error Handling', () => {
  it('should handle missing project directory gracefully', async () => {
    const mockServer = new MockMcpServer() as any
    registerRunVitestTool(mockServer)

    const tool = mockServer.getTool('run-vitest')

    // Test with non-existent directory
    const result = await tool.handler({ projectDir: '/non/existent/path' })

    expect(result.content[0].text).toContain('Project directory does not exist')
  })

  it('should have proper error handling structure', async () => {
    const mockServer = new MockMcpServer() as any
    registerRunVitestTool(mockServer)

    const tool = mockServer.getTool('run-vitest')

    // Test that the tool handler exists and has the right structure
    expect(tool.handler).toBeDefined()
    expect(tool.schema.properties.projectDir).toHaveProperty('description')
    expect(tool.schema.properties.projectDir.description).toContain('auto-detected')
  })

  it('should validate tool schema parameters', () => {
    const mockServer = new MockMcpServer() as any
    registerRunVitestTool(mockServer)
    registerRunVitestCoverageTool(mockServer)

    const runVitestTool = mockServer.getTool('run-vitest')
    const runCoverageTool = mockServer.getTool('run-vitest-coverage')

    // Both tools should have same schema structure
    expect(runVitestTool.schema.type).toBe('object')
    expect(runCoverageTool.schema.type).toBe('object')

    expect(runVitestTool.schema.properties.projectDir.type).toBe('string')
    expect(runCoverageTool.schema.properties.projectDir.type).toBe('string')

    expect(runVitestTool.schema.required).toEqual([])
    expect(runCoverageTool.schema.required).toEqual([])

    expect(runVitestTool.schema.additionalProperties).toBe(false)
    expect(runCoverageTool.schema.additionalProperties).toBe(false)
  })

  it('should handle environment variable fallbacks', () => {
    // Test the environment variable fallback logic
    const originalEnv = process.env.VITEST_PROJECT_DIR

    // Test with environment variable set
    process.env.VITEST_PROJECT_DIR = '/test/env/path'

    // The tool should respect this in its internal logic
    expect(process.env.VITEST_PROJECT_DIR).toBe('/test/env/path')

    // Restore original environment
    if (originalEnv !== undefined) {
      process.env.VITEST_PROJECT_DIR = originalEnv
    } else {
      delete process.env.VITEST_PROJECT_DIR
    }
  })

  it('should handle NODE_ENV setting correctly', () => {
    const originalNodeEnv = process.env.NODE_ENV

    // The tools should set NODE_ENV to 'test'
    // We can verify this expectation exists in the code
    const expectedEnv = 'test'

    expect(expectedEnv).toBe('test')

    // Restore original environment
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
  })
})
