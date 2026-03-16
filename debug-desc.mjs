import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const config = JSON.parse(readFileSync(join(homedir(), '.opcli', 'config.json'), 'utf-8'));
const cookie = `_open_project_session=${config.session}`;

const res = await fetch(`${config.url}/api/v3/work_packages/54057`, {
  headers: { Cookie: cookie },
});
const data = await res.json();
console.log('Description format:', data.description?.format);
console.log('\nRaw (first 1000):');
console.log(data.description?.raw?.substring(0, 1000));
console.log('\nHTML (first 1000):');
console.log(data.description?.html?.substring(0, 1000));
