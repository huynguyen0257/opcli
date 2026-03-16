import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const config = JSON.parse(readFileSync(join(homedir(), '.opcli', 'config.json'), 'utf-8'));
const cookie = `_open_project_session=${config.session}`;

const res = await fetch(`${config.url}/api/v3/work_packages/54405/activities?pageSize=5`, {
  headers: { Cookie: cookie },
});
const data = await res.json();
console.log('Total:', data.total);
const elements = data._embedded?.elements || [];
elements.forEach((el, i) => {
  console.log(`\n--- Activity ${i + 1} ---`);
  console.log('ID:', el.id);
  console.log('Type:', el._type);
  console.log('Created:', el.createdAt);
  console.log('User:', el._links?.user?.title);
  console.log('Comment format:', el.comment?.format);
  console.log('Comment raw (first 200):', el.comment?.raw?.substring(0, 200));
  console.log('Comment html (first 200):', el.comment?.html?.substring(0, 200));
  if (el.details) {
    console.log('Details:', JSON.stringify(el.details).substring(0, 300));
  }
  if (el._links?.details) {
    console.log('Details links:', JSON.stringify(el._links.details).substring(0, 300));
  }
});
