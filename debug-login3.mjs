// Simple approach like curl - no CSRF, just POST directly
const body = new URLSearchParams({
  username: 'thuchuynh@chidoanh.com',
  password: 'thailan147325',
});

let currentSession = '';
let res = await fetch('https://devtak.cbidigital.com/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: body.toString(),
  redirect: 'manual',
});
console.log('POST status:', res.status);
console.log('POST location:', res.headers.get('location'));
const postCookie = res.headers.get('set-cookie') || '';
const postMatch = postCookie.match(/_open_project_session=([^;]+)/);
if (postMatch) currentSession = postMatch[1];
console.log('POST session:', currentSession ? currentSession.substring(0, 15) + '...' : 'none');

// Follow redirects
while (res.status >= 300 && res.status < 400) {
  const location = res.headers.get('location');
  if (!location) break;
  console.log('Following:', location);
  res = await fetch(location, {
    redirect: 'manual',
    headers: { Cookie: '_open_project_session=' + currentSession },
  });
  console.log('Status:', res.status);
  const cookie = res.headers.get('set-cookie') || '';
  const m = cookie.match(/_open_project_session=([^;]+)/);
  if (m) {
    currentSession = m[1];
    console.log('New session:', currentSession.substring(0, 15) + '...');
  }
}

// Verify
const meRes = await fetch('https://devtak.cbidigital.com/api/v3/users/me', {
  headers: { Cookie: '_open_project_session=' + currentSession },
});
console.log('\nVerify status:', meRes.status);
const me = await meRes.json();
console.log('User:', me.firstName, me.lastName || me.message || '');
