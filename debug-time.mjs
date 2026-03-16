import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const config = JSON.parse(readFileSync(join(homedir(), '.opcli', 'config.json'), 'utf-8'));
const cookie = `_open_project_session=${config.session}`;

// Check time entries endpoint
const res = await fetch(`${config.url}/api/v3/time_entries?pageSize=2`, {
  headers: { Cookie: cookie },
});
console.log('Status:', res.status);
if (res.ok) {
  const data = await res.json();
  console.log('Total:', data.total);
  const el = data._embedded?.elements?.[0];
  if (el) console.log('Sample:', JSON.stringify(el, null, 2).substring(0, 600));
}

// Check available activities for time entry
const res2 = await fetch(`${config.url}/api/v3/time_entries/available_projects`, {
  headers: { Cookie: cookie },
});
console.log('\nAvailable projects:', res2.status);

// Try to POST a time entry (dry run - just check schema)
const res3 = await fetch(`${config.url}/api/v3/time_entries/form`, {
  method: 'POST',
  headers: { Cookie: cookie, 'Content-Type': 'application/json' },
  body: JSON.stringify({ _links: { workPackage: { href: '/api/v3/work_packages/51831' } } }),
});
console.log('\nTime entry form:', res3.status);
if (res3.ok) {
  const form = await res3.json();
  const schema = form._embedded?.schema;
  if (schema) {
    console.log('Schema keys:', Object.keys(schema).join(', '));
  }
}
