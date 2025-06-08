import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Create a temporary directory with a vitest config for testing
 */
export function createTempProject(configName = 'vitest.config.ts'): string {
  const tempDir = join(
    tmpdir(),
    `vitest-mcp-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  )

  mkdirSync(tempDir, { recursive: true })

  // Create a basic vitest config
  const configContent = `
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node'
  }
})
  `.trim()

  writeFileSync(join(tempDir, configName), configContent)

  return tempDir
}

/**
 * Clean up temporary directory
 */
export function cleanupTempProject(tempDir: string): void {
  try {
    rmSync(tempDir, { recursive: true, force: true })
  } catch (error) {
    // Ignore cleanup errors
  }
}

/**
 * Mock McpServer for testing
 */
export class MockMcpServer {
  private tools = new Map()
  private resources = new Map()

  tool(name: string, schema: any, handler: Function) {
    this.tools.set(name, { schema, handler })
  }

  resource(name: string, uri: string, handler: Function) {
    this.resources.set(name, { uri, handler })
  }

  getTool(name: string) {
    return this.tools.get(name)
  }

  getResource(name: string) {
    return this.resources.get(name)
  }

  getAllTools() {
    return Array.from(this.tools.keys())
  }

  getAllResources() {
    return Array.from(this.resources.keys())
  }
}
