export const getToken = () => localStorage.getItem('ql_token');

export async function api(path: string, method = 'GET', body?: any) {
  const t = getToken();
  const r = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}
