#!/usr/bin/env node

import { spawn } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Start the MCP server
const mcpServer = spawn('node', [join(__dirname, 'dist/index.js')], {
  stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
  env: {
    ...process.env,
    VITEST_PROJECT_DIR: '/Users/madrus/dev/biz/toernooien/tournado',
  },
})

let responseBuffer = ''

mcpServer.stdout.on('data', data => {
  responseBuffer += data.toString()

  // Look for complete JSON-RPC messages
  const lines = responseBuffer.split('\n')
  responseBuffer = lines.pop() || '' // Keep incomplete line in buffer

  for (const line of lines) {
    if (line.trim()) {
      try {
        const message = JSON.parse(line)
        console.log('MCP Response:', JSON.stringify(message, null, 2))
      } catch (e) {
        console.log('Raw output:', line)
      }
    }
  }
})

mcpServer.on('close', code => {
  console.log(`MCP server exited with code ${code}`)
  process.exit(code || 0)
})

// Send initialization request
const initRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {
      tools: {},
    },
    clientInfo: {
      name: 'debug-test',
      version: '1.0.0',
    },
  },
}

console.log('Sending init request...')
mcpServer.stdin.write(JSON.stringify(initRequest) + '\n')

// Wait a bit then send a ping
setTimeout(() => {
  const pingRequest = {
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name: 'ping',
      arguments: {},
    },
  }

  console.log('Sending ping request...')
  mcpServer.stdin.write(JSON.stringify(pingRequest) + '\n')
}, 1000)

// Wait a bit then send run-vitest
setTimeout(() => {
  const vitestRequest = {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'run-vitest',
      arguments: {},
    },
  }

  console.log('Sending run-vitest request...')
  mcpServer.stdin.write(JSON.stringify(vitestRequest) + '\n')
}, 2000)

// Exit after 90 seconds
setTimeout(() => {
  console.log('Timeout reached, killing server...')
  mcpServer.kill()
}, 90000)
