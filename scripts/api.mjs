import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const backend = join(dirname(fileURLToPath(import.meta.url)), '..', 'backend');
const python = join(backend, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
if (!existsSync(python)) { console.error('Missing backend virtual environment. Follow README.md setup instructions.'); process.exit(1); }
const testing = process.argv.includes('--test');
const args = testing ? ['-m', 'pytest', 'tests', '-q'] : ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', '8000'];
const child = spawn(python, args, { cwd: backend, stdio: 'inherit', env: process.env });
child.on('exit', code => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
