const getRes = await fetch('https://devtak.cbidigital.com/login', { redirect: 'manual' });
const html = await getRes.text();
const csrfMatch = html.match(/name="authenticity_token" value="([^"]+)"/);
console.log('CSRF found:', csrfMatch !== null);
const getCookie = getRes.headers.get('set-cookie') || '';
const getSession = getCookie.match(/_open_project_session=([^;]+)/);
console.log('GET session cookie found:', getSession !== null);

const body = new URLSearchParams({
  authenticity_token: csrfMatch[1],
  username: 'thuchuynh@chidoanh.com',
  password: 'thailan147325',
});
const postRes = await fetch('https://devtak.cbidigital.com/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Cookie: '_open_project_session=' + getSession[1],
  },
  body: body.toString(),
  redirect: 'manual',
});
console.log('POST status:', postRes.status);
console.log('POST location:', postRes.headers.get('location'));
const postCookie = postRes.headers.get('set-cookie') || '';
console.log('POST set-cookie present:', postCookie.length > 0);
console.log('POST set-cookie has session:', postCookie.includes('_open_project_session'));
if (postCookie.includes('_open_project_session')) {
  const m = postCookie.match(/_open_project_session=([^;]+)/);
  console.log('Session ID:', m[1].substring(0, 15) + '...');
} else {
  const postBody = await postRes.text();
  console.log('Response body (first 300):', postBody.substring(0, 300));
}
