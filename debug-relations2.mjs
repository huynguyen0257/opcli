import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const config = JSON.parse(readFileSync(join(homedir(), '.opcli', 'config.json'), 'utf-8'));
const cookie = `_open_project_session=${config.session}`;

const res = await fetch(`${config.url}/api/v3/work_packages/51831/relations`, {
  headers: { Cookie: cookie },
});
const data = await res.json();
const elements = data._embedded?.elements || [];
for (const el of elements) {
  console.log('Type:', el.type, '| Name:', el.name);
  console.log('From:', el._links?.from?.href, el._links?.from?.title);
  console.log('To:', el._links?.to?.href, el._links?.to?.title);
  console.log();
}
