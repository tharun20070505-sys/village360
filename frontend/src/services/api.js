import axios from 'axios';
const api = axios.create({baseURL:import.meta.env.VITE_API_BASE_URL || '/api',withCredentials:true,timeout:25000});
let csrfToken;
export function setCsrf(value){csrfToken=value;}
api.interceptors.request.use(config=>{
  if(csrfToken && !['get','head','options'].includes(config.method)) config.headers['X-CSRF-Token']=csrfToken;
  return config;
});
api.interceptors.response.use(response=>response,error=>{
  if(error.response?.status===401 && !['/auth/login','/auth/me'].includes(error.config?.url)) window.dispatchEvent(new Event('session-expired'));
  return Promise.reject(error);
});
export function errorText(error){
  const detail=error.response?.data;
  return detail?.error?.message || detail?.message || (typeof detail?.error==='string' && detail.error) || (error.response?'The request could not be completed.':'The survey server could not be reached. Check your connection and try again.');
}
export default api;
