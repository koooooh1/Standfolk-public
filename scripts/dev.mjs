// `npm run dev`: starts the agent service, the API, and the dashboard together, each line prefixed with its name.
// Settings come from the shell and from `.env` in the repository root when it exists (gitignored).
// The model key goes only to the agent service; the API and the dashboard never receive it.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const isWindows = process.platform === 'win32';
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'));

const agentsPort = process.env.AGENTS_PORT ?? '8001';
const python = join(root, 'services', 'agents', '.venv', isWindows ? 'Scripts/python.exe' : 'bin/python');
const { MODEL_API_KEY, ...withoutKey } = process.env;
const hasAgents = existsSync(python);

const services = [
  hasAgents && {
    name: 'agents', command: python, cwd: join(root, 'services', 'agents'), env: process.env,
    args: ['-m', 'uvicorn', 'standfolk_agents.app:create_default_app', '--factory', '--app-dir', 'src', '--host', '127.0.0.1', '--port', agentsPort, '--reload']
  },
  { name: 'api', command: 'npm', args: ['run', 'dev', '-w', 'apps/api'], cwd: root, env: { ...withoutKey, ...(hasAgents && { AGENTS_URL: process.env.AGENTS_URL ?? `http://127.0.0.1:${agentsPort}` }) } },
  { name: 'web', command: 'npm', args: ['run', 'dev', '-w', 'apps/web'], cwd: root, env: withoutKey }
].filter(Boolean);

if (!hasAgents) console.warn('[dev] services/agents/.venv not found: Ask uses templates only. See services/agents/README.md to set it up.');
else if (!MODEL_API_KEY) console.warn('[dev] MODEL_API_KEY is not set: the agent service runs without a model (outcome no_model).');

const children = services.map(({ name, command, args, cwd, env }) => {
  // npm is a .cmd script on Windows, which only starts through a shell; the arguments are fixed, never user input.
  const child = spawn(command, args, { cwd, env, shell: isWindows && command === 'npm' });
  for (const stream of [child.stdout, child.stderr]) createInterface({ input: stream }).on('line', (line) => console.log(`[${name}] ${line}`));
  child.on('exit', (code) => {
    console.log(`[${name}] exited with code ${code}`);
    stopAll(code ?? 1);
  });
  return child;
});

let isStopping = false;
function stopAll(code) {
  if (isStopping) return;
  isStopping = true;
  for (const child of children) {
    if (child.exitCode !== null) continue;
    // On Windows, kill the whole process tree: npm and the shell would otherwise leave the server running.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
