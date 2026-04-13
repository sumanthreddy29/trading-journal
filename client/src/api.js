let _token = localStorage.getItem('tj_token') || '';

export function setApiToken(t) { _token = t; }

export const API = {
  async req(method, path, body) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(_token ? { Authorization: 'Bearer ' + _token } : {}),
      },
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(path, opts);
    if (r.status === 401) return null;
    return r.json();
  },
  get(p)    { return this.req('GET',    p); },
  post(p, b){ return this.req('POST',   p, b); },
  put(p, b) { return this.req('PUT',    p, b); },
  del(p)    { return this.req('DELETE', p); },
};
