import fs from 'node:fs';

fs.rmSync('dist', { recursive: true, force: true });
fs.rmSync('coverage', { recursive: true, force: true });
