// Step 1: GET /login
const getRes = await fetch('https://devtak.cbidigital.com/login', { redirect: 'manual' });
const html = await getRes.text();
const csrfMatch = html.match(/name="authenticity_token" value="([^"]+)"/);
const getCookie = getRes.headers.get('set-cookie') || '';
const getSession = getCookie.match(/_open_project_session=([^;]+)/)[1];

// Step 2: POST /login
const body = new URLSearchParams({
  authenticity_token: csrfMatch[1],
  username: 'thuchuynh@chidoanh.com',
  password: 'thailan147325',
});
const postRes = await fetch('https://devtak.cbidigital.com/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Cookie: '_open_project_session=' + getSession,
  },
  body: body.toString(),
  redirect: 'manual',
});
console.log('Step 2 status:', postRes.status);
console.log('Step 2 location:', postRes.headers.get('location'));
const postCookie = postRes.headers.get('set-cookie') || '';
const postSession = postCookie.match(/_open_project_session=([^;]+)/);
const sessionAfterLogin = postSession ? postSession[1] : getSession;
console.log('Session after login:', sessionAfterLogin.substring(0, 15) + '...');

// Step 3: Follow redirect to 2FA request
const redirectUrl = postRes.headers.get('location');
console.log('\nFollowing redirect to:', redirectUrl);
const step3 = await fetch(redirectUrl, {
  redirect: 'manual',
  headers: { Cookie: '_open_project_session=' + sessionAfterLogin },
});
console.log('Step 3 status:', step3.status);
console.log('Step 3 location:', step3.headers.get('location'));
const step3Cookie = step3.headers.get('set-cookie') || '';
const step3Session = step3Cookie.match(/_open_project_session=([^;]+)/);
console.log('Step 3 new cookie:', step3Session ? 'yes' : 'no');

const step3Body = await step3.text();
console.log('\nStep 3 body (first 500):');
console.log(step3Body.substring(0, 500));

// If there's another redirect, follow it
if (step3.status >= 300 && step3.status < 400) {
  const loc2 = step3.headers.get('location');
  const s3s = step3Session ? step3Session[1] : sessionAfterLogin;
  console.log('\nFollowing redirect to:', loc2);
  const step4 = await fetch(loc2, {
    redirect: 'manual',
    headers: { Cookie: '_open_project_session=' + s3s },
  });
  console.log('Step 4 status:', step4.status);
  console.log('Step 4 location:', step4.headers.get('location'));
  const step4Cookie = step4.headers.get('set-cookie') || '';
  const step4Session = step4Cookie.match(/_open_project_session=([^;]+)/);
  console.log('Step 4 new cookie:', step4Session ? step4Session[1].substring(0, 15) + '...' : 'no');

  // Test if this session works
  const testSession = step4Session ? step4Session[1] : s3s;
  const meRes = await fetch('https://devtak.cbidigital.com/api/v3/users/me', {
    headers: { Cookie: '_open_project_session=' + testSession },
  });
  console.log('\n/api/v3/users/me status:', meRes.status);
  const meBody = await meRes.json();
  console.log('User:', meBody.firstName, meBody.lastName || meBody.message || '');
}
