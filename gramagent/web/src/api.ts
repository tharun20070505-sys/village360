export type Data = Record<string, any>;
const API=(import.meta as any).env.VITE_API_URL || '/api/v1';
let accessToken=sessionStorage.getItem('gram-token')||'';
export function setToken(value:string){accessToken=value;value?sessionStorage.setItem('gram-token',value):sessionStorage.removeItem('gram-token');}
export async function api(path:string, options:RequestInit={}):Promise<any>{
 const response=await fetch(API+path,{...options,headers:{...(options.body instanceof FormData?{}:{'Content-Type':'application/json'}),...(accessToken?{Authorization:'Bearer '+accessToken}:{}),...options.headers}});
 if(!response.ok){let msg;try{const body=await response.json();msg=typeof body.detail==='string'?body.detail:JSON.stringify(body.detail);}catch{msg=await response.text().catch(()=>response.statusText);}throw new Error(msg||'Request failed');}
 return response.json();
}
export async function download(path:string,filename:string){const response=await fetch(API+path,{headers:{Authorization:'Bearer '+accessToken}});if(!response.ok)throw new Error('Export unavailable');const url=URL.createObjectURL(await response.blob());const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export const post=(path:string,body:unknown={})=>api(path,{method:'POST',body:JSON.stringify(body)});
