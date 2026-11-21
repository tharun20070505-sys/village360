import {createContext,useContext,useState,useCallback,useEffect} from 'react';
import api,{setCsrf,errorText} from '../services/api';
const Auth=createContext(null);
export const useAuth=()=>useContext(Auth);
export function AuthProvider({children}){
 const [user,setUser]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const accept=({user,csrfToken})=>{setCsrf(csrfToken);setUser(user);return user;};
 const refresh=useCallback(async()=>{
   setLoading(true);setError('');
   try{accept((await api.get('/auth/me')).data);}catch(e){accept({user:null});if(e.response?.status!==401)setError(errorText(e));}finally{setLoading(false);}
 },[]);
 useEffect(()=>{refresh();const expire=()=>accept({user:null});window.addEventListener('session-expired',expire);return()=>window.removeEventListener('session-expired',expire);},[refresh]);
 const login=async(values)=>{const data=(await api.post('/auth/login',values)).data;setError('');return accept(data);};
 const logout=async()=>{await api.post('/auth/logout');accept({user:null});};
 return <Auth.Provider value={{user,loading,error,refresh,login,logout}}>{children}</Auth.Provider>;
}
