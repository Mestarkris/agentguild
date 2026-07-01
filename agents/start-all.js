const { spawn } = require('child_process');
const path = require('path');

const AGENTS = [
  'summarizer', 'code-review', 'research', 'translate',
  'sentiment', 'sql', 'chart', 'extract',
  'legal-review', 'finance', 'transcribe', 'fact-check',
];

const COLORS = ['\x1b[36m', '\x1b[35m', '\x1b[33m', '\x1b[32m',
                '\x1b[34m', '\x1b[31m', '\x1b[96m', '\x1b[95m',
                '\x1b[93m', '\x1b[92m', '\x1b[94m', '\x1b[91m'];
const RESET = '\x1b[0m';

console.log('Starting all AgentGuild agents...\n');

AGENTS.forEach((agent, i) => {
  const color = COLORS[i % COLORS.length];
  const label = `[${agent}]`.padEnd(16);
  const entry = path.join(__dirname, agent, 'index.js');

  const proc = spawn('node', [entry], {
    cwd: __dirname,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout.on('data', d => process.stdout.write(`${color}${label}${RESET} ${d}`));
  proc.stderr.on('data', d => process.stderr.write(`${color}${label}${RESET} ${d}`));

  proc.on('exit', code => {
    if (code !== 0) console.error(`${color}${label}${RESET} exited with code ${code}`);
  });
});

process.on('SIGINT', () => {
  console.log('\nShutting down all agents...');
  process.exit(0);
});
