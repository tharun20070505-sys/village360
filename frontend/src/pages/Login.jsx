import {useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router-dom';
import {Eye,EyeOff,Landmark,LockKeyhole} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {z} from 'zod';
import {zodResolver} from '@hookform/resolvers/zod';
import {useAuth} from '../context/Auth';
import {errorText} from '../services/api';
const schema=z.object({identifier:z.string().trim().min(1,'Enter your email or surveyor ID.'),password:z.string().min(1,'Enter your password.')});
export default function Login(){
 const {login}=useAuth(),nav=useNavigate(),loc=useLocation();
 const [show,setShow]=useState(false),[error,setError]=useState('');
 const {register,handleSubmit,formState:{errors,isSubmitting}}=useForm({resolver:zodResolver(schema)});
 const submit=async v=>{setError('');try{const u=await login(v);const intended=loc.state?.from;nav(intended?.startsWith('/')&&!intended.startsWith('//')?intended:u.role==='surveyor'?'/workspace':'/dashboard',{replace:true});}catch(e){setError(errorText(e));}};
 return <main className="loginArea"><section className="loginBox"><Link to="/" className="brand"><Landmark/> VILLAGE 360°</Link><div className="lock"><LockKeyhole/></div><h1>Sign in to your workspace</h1><p>Use the account issued by your project coordinator.</p><form onSubmit={handleSubmit(submit)} noValidate><label>Email / Surveyor ID<input autoComplete="username" {...register('identifier')}/></label>{errors.identifier&&<small role="alert">{errors.identifier.message}</small>}<label htmlFor="pass">Password</label><div className="pass"><input id="pass" type={show?'text':'password'} autoComplete="current-password" {...register('password')}/><button type="button" aria-label={show?'Hide password':'Show password'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div>{errors.password&&<small role="alert">{errors.password.message}</small>}{error&&<p role="alert">{error}</p>}<button className="primary" disabled={isSubmitting}>{isSubmitting?'Signing in…':'Sign in'}</button></form><Link to="/">Back to homepage</Link></section></main>;
}
