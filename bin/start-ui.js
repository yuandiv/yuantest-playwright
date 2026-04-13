#!/usr/bin/env node
const { execSync, spawn } = require('child_process');
const path = require('path');

const DEFAULT_PORT = 5274;
const port = parseInt(process.argv[2]) || DEFAULT_PORT;

function killProcessOnPort(port) {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
      const lines = result.trim().split('\n').filter(Boolean);
      const pids = new Set();
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
          pids.add(pid);
        }
      }
      
      for (const pid of pids) {
        try {
          execSync(`tasklist /FI "PID eq ${pid}" 2>nul | findstr ${pid}`, { encoding: 'utf8' });
          execSync(`taskkill /F /PID ${pid}`, { encoding: 'utf8' });
          console.log(`\x1b[32m\u2713\x1b[0m Terminated process PID: ${pid}`);
        } catch (e) {
          // Process may have already terminated
        }
      }
    } else {
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, { 
        encoding: 'utf8',
        shell: '/bin/bash'
      });
      console.log(`\x1b[32m\u2713\x1b[0m Cleaned port ${port}`);
    }
  } catch (e) {
    // Port not in use, ignore error
  }
}

console.log(`\n\x1b[36m\u2728\x1b[0m Checking port ${port}...`);
killProcessOnPort(port);

console.log(`\x1b[34m\u2728\x1b[0m Starting YuanTest Dashboard...`);
console.log(`   http://localhost:${port}\n`);

const cliPath = path.join(__dirname, 'cli.js');
const child = spawn(process.execPath, [cliPath, 'ui', '-p', String(port)], {
  stdio: 'inherit'
});

child.on('error', (err) => {
  console.error('Failed to start:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code || 0);
});
