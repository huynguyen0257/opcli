import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const config = JSON.parse(readFileSync(join(homedir(), '.opcli', 'config.json'), 'utf-8'));
const cookie = `_open_project_session=${config.session}`;

// Try different endpoints
const endpoints = [
  '/api/v3/users?pageSize=5',
  '/api/v3/principals?pageSize=5',
  '/api/v3/memberships/available_projects',
];

for (const ep of endpoints) {
  const res = await fetch(`${config.url}${ep}`, {
    headers: { Cookie: cookie },
  });
  console.log(`${ep} => ${res.status}`);
  if (res.ok) {
    const data = await res.json();
    const elements = data._embedded?.elements || [];
    console.log(`  Found ${elements.length} results`);
    if (elements.length > 0) {
      console.log('  Sample:', JSON.stringify(elements[0]).substring(0, 200));
    }
  }
  console.log();
}
