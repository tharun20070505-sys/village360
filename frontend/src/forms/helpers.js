import { useEffect, useState } from 'react';
import api from '../services/api';
import { message } from '../pages/WorkspaceShared';

export function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0,10);
}
export function clean(values) {
  return Object.fromEntries(Object.entries(values || {}).filter(([,v]) => v !== '' && v != null && !Number.isNaN(v)));
}
export const objectId = x => x?._id || x || '';
export const show = v => typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v ?? '—';

export function useChoices(path) {
  const [result,setResult] = useState({});
  const [attempt,setAttempt] = useState(0);
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    async function load() {
      const arr = [];
      let page = 1, total;
      do {
        const {data} = await api.get(path, {params:{page,limit:100},signal:abort.signal});
        const items = Array.isArray(data) ? data : data.items;
        arr.push(...items);
        total = data.total ?? arr.length;
        if (!items.length) break;
        page++;
      } while (arr.length < total);
      if (!abort.signal.aborted) setResult({path,attempt,items:arr});
    }
    load().catch(e => { if (!abort.signal.aborted) setResult({path,attempt,error:message(e)}); });
    return () => abort.abort();
  }, [path,attempt]);
  const same = path && result.path === path && result.attempt === attempt;
  return {items:same ? result.items || [] : [],error:same && result.error,loading:!!path && !same,retry:()=>setAttempt(x=>x+1)};
}

export async function uploadPhoto(endpoint,id,file) {
  const body = new FormData();
  body.append('photo',file);
  await api.put(endpoint + '/' + id + '/photo',body);
}
