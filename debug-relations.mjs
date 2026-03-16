import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const config = JSON.parse(readFileSync(join(homedir(), '.opcli', 'config.json'), 'utf-8'));
const cookie = `_open_project_session=${config.session}`;

const res = await fetch(`${config.url}/api/v3/work_packages/51831/relations`, {
  headers: { Cookie: cookie },
});
const data = await res.json();
console.log('Total:', data.total);
const elements = data._embedded?.elements || [];
elements.forEach((el, i) => {
  console.log(`\n--- Relation ${i + 1} ---`);
  console.log(JSON.stringify(el, null, 2).substring(0, 500));
});
