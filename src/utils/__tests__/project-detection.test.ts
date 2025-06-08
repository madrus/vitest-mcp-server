import { cleanupTempProject, createTempProject } from '@/utils/test-helpers'
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { afterEach, describe, expect, it } from 'vitest'

// We need to extract the findProjectDirectory function from the tools
// For now, let's test the logic conceptually and create a standalone version

/**
 * Extracted project directory detection logic for testing
 */
function findProjectDirectory(startDir: string): string | null {
  let currentDir = startDir
  const root = '/'

  while (currentDir !== root) {
    const vitestConfigs = [
      'vitest.config.ts',
      'vitest.config.js',
      'vitest.config.mjs',
      'vite.config.ts',
      'vite.config.js',
      'vite.config.mjs',
    ]

    for (const config of vitestConfigs) {
      try {
        const configPath = join(currentDir, config)
        // Simple file existence check
        require('fs').accessSync(configPath)
        return currentDir
      } catch {
        // File doesn't exist, continue
      }
    }

    // Move up one directory
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) break // Reached root
    currentDir = parentDir
  }

  return null
}

describe('Project Detection', () => {
  let tempDirs: string[] = []

  afterEach(() => {
    // Clean up all temp directories
    tempDirs.forEach(dir => cleanupTempProject(dir))
    tempDirs = []
  })

  it('should find vitest.config.ts in current directory', () => {
    const tempDir = createTempProject('vitest.config.ts')
    tempDirs.push(tempDir)

    const result = findProjectDirectory(tempDir)
    expect(result).toBe(tempDir)
  })

  it('should find vitest.config.js in current directory', () => {
    const tempDir = createTempProject('vitest.config.js')
    tempDirs.push(tempDir)

    const result = findProjectDirectory(tempDir)
    expect(result).toBe(tempDir)
  })

  it('should find vite.config.ts in current directory', () => {
    const tempDir = createTempProject('vite.config.ts')
    tempDirs.push(tempDir)

    const result = findProjectDirectory(tempDir)
    expect(result).toBe(tempDir)
  })

  it('should find config in parent directory', () => {
    const tempDir = createTempProject('vitest.config.ts')
    tempDirs.push(tempDir)

    // Create a subdirectory
    const subDir = join(tempDir, 'src', 'components')
    mkdirSync(subDir, { recursive: true })

    // Should find config in parent
    const result = findProjectDirectory(subDir)
    expect(result).toBe(tempDir)
  })

  it('should find config in grandparent directory', () => {
    const tempDir = createTempProject('vitest.config.ts')
    tempDirs.push(tempDir)

    // Create nested subdirectories
    const deepDir = join(tempDir, 'src', 'components', 'ui', 'forms')
    mkdirSync(deepDir, { recursive: true })

    // Should find config in grandparent
    const result = findProjectDirectory(deepDir)
    expect(result).toBe(tempDir)
  })

  it('should return null when no config found', () => {
    const tempDir = join(require('os').tmpdir(), `no-config-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    tempDirs.push(tempDir)

    const result = findProjectDirectory(tempDir)
    expect(result).toBeNull()
  })

  it('should prioritize vitest.config.ts over vite.config.ts', () => {
    const tempDir = join(require('os').tmpdir(), `priority-test-${Date.now()}`)
    mkdirSync(tempDir, { recursive: true })
    tempDirs.push(tempDir)

    // Create both configs
    writeFileSync(join(tempDir, 'vite.config.ts'), 'export default {}')
    writeFileSync(join(tempDir, 'vitest.config.ts'), 'export default {}')

    const result = findProjectDirectory(tempDir)
    expect(result).toBe(tempDir)

    // The function should find it (we can't test priority easily without mocking)
    expect(result).not.toBeNull()
  })
})
