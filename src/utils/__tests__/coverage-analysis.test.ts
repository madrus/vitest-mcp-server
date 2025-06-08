import { describe, expect, it } from 'vitest'

/**
 * Extract functions from the coverage tool for testing
 * These are pure functions that we can test in isolation
 */

function groupLinesIntoRanges(lines: number[]): string[] {
  if (lines.length === 0) return []

  // Remove duplicates and sort
  const sorted = Array.from(new Set(lines)).sort((a, b) => a - b)
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

function extractUncoveredLines(coverageData: any): { [filePath: string]: any[] } {
  const uncoveredLines: { [filePath: string]: any[] } = {}

  for (const [filePath, fileData] of Object.entries(coverageData)) {
    if (!fileData || typeof fileData !== 'object') continue

    const { statementMap, s: statementCounts } = fileData as any
    if (!statementMap) continue

    const uncovered: any[] = []

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

describe('Coverage Analysis Utils', () => {
  describe('groupLinesIntoRanges', () => {
    it('should return empty array for empty input', () => {
      expect(groupLinesIntoRanges([])).toEqual([])
    })

    it('should handle single line', () => {
      expect(groupLinesIntoRanges([5])).toEqual(['5'])
    })

    it('should handle consecutive lines', () => {
      expect(groupLinesIntoRanges([1, 2, 3, 4])).toEqual(['1-4'])
    })

    it('should handle non-consecutive lines', () => {
      expect(groupLinesIntoRanges([1, 3, 5])).toEqual(['1', '3', '5'])
    })

    it('should handle mixed consecutive and non-consecutive lines', () => {
      expect(groupLinesIntoRanges([1, 2, 4, 5, 6, 8, 10, 11])).toEqual([
        '1-2',
        '4-6',
        '8',
        '10-11',
      ])
    })

    it('should handle unsorted input', () => {
      expect(groupLinesIntoRanges([5, 1, 3, 2])).toEqual(['1-3', '5'])
    })

    it('should handle duplicates', () => {
      expect(groupLinesIntoRanges([1, 1, 2, 2, 4, 4])).toEqual(['1-2', '4'])
    })
  })

  describe('extractUncoveredLines', () => {
    it('should extract uncovered lines from coverage data', () => {
      const coverageData = {
        '/test/file.ts': {
          statementMap: {
            '1': { start: { line: 10, column: 0 } },
            '2': { start: { line: 15, column: 4 } },
            '3': { start: { line: 20, column: 2 } },
          },
          s: {
            '1': 1, // covered
            '2': 0, // not covered
            '3': 1, // covered
          },
        },
      }

      const result = extractUncoveredLines(coverageData)

      expect(result).toHaveProperty('/test/file.ts')
      expect(result['/test/file.ts']).toEqual([{ line: 15 }])
    })

    it('should handle files with no statement counts', () => {
      const coverageData = {
        '/test/file.ts': {
          statementMap: {
            '1': { start: { line: 10, column: 0 } },
            '2': { start: { line: 15, column: 4 } },
          },
          // No 's' property - all statements uncovered
        },
      }

      const result = extractUncoveredLines(coverageData)

      expect(result).toHaveProperty('/test/file.ts')
      expect(result['/test/file.ts']).toHaveLength(2)
      expect(result['/test/file.ts']).toContainEqual({ line: 10 })
      expect(result['/test/file.ts']).toContainEqual({ line: 15 })
    })

    it('should handle files with all lines covered', () => {
      const coverageData = {
        '/test/file.ts': {
          statementMap: {
            '1': { start: { line: 10, column: 0 } },
            '2': { start: { line: 15, column: 4 } },
          },
          s: {
            '1': 5, // covered
            '2': 3, // covered
          },
        },
      }

      const result = extractUncoveredLines(coverageData)

      expect(result).not.toHaveProperty('/test/file.ts')
    })

    it('should handle invalid file data', () => {
      const coverageData = {
        '/test/file1.ts': null,
        '/test/file2.ts': 'invalid',
        '/test/file3.ts': {
          // missing statementMap
          s: { '1': 0 },
        },
      }

      const result = extractUncoveredLines(coverageData)

      expect(Object.keys(result)).toHaveLength(0)
    })

    it('should sort lines correctly', () => {
      const coverageData = {
        '/test/file.ts': {
          statementMap: {
            '1': { start: { line: 20, column: 0 } },
            '2': { start: { line: 5, column: 0 } },
            '3': { start: { line: 15, column: 0 } },
            '4': { start: { line: 10, column: 0 } },
          },
          s: {
            '1': 0, // line 20 - not covered
            '2': 0, // line 5 - not covered
            '3': 0, // line 15 - not covered
            '4': 0, // line 10 - not covered
          },
        },
      }

      const result = extractUncoveredLines(coverageData)

      expect(result['/test/file.ts']).toEqual([
        { line: 5 },
        { line: 10 },
        { line: 15 },
        { line: 20 },
      ])
    })
  })
})
