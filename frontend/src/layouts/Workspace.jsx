import {useState} from 'react';
import {Link,NavLink,Outlet,Navigate,useLocation} from 'react-router-dom';
import {Landmark,LayoutDashboard,ClipboardList,FileBarChart,Settings,LogOut} from 'lucide-react';
import {useAuth} from '../context/Auth';
import {errorText} from '../services/api';
export function Pending(){return <div className="pending" role="status"><span/>Loading workspace…</div>;}
export default function Workspace(){
 const {user,loading,error,refresh,logout}=useAuth(),loc=useLocation(),[message,setMessage]=useState('');
 if(loading)return <Pending/>;
 if(error)return <main className="offline"><h1>Workspace unavailable</h1><p>{error}</p><button onClick={refresh}>Retry connection</button> <Link to="/">Home</Link></main>;
 if(!user)return <Navigate to="/login" replace state={{from:loc.pathname+loc.search}}/>;
 const nav=[['/dashboard','Dashboard',LayoutDashboard],...(user.role==='viewer'?[]:[['/workspace','Fieldwork',ClipboardList]]),...(user.role==='surveyor'?[]:[['/reports','Reports',FileBarChart]]),...(user.role==='admin'?[['/admin','Administration',Settings]]:[])];
 return <div className="workspaceShell"><header className="workNav"><Link to="/" className="brand"><Landmark/> VILLAGE 360°</Link><nav>{nav.map(([path,title,Icon])=><NavLink key={path} to={path}><Icon size={16}/>{title}</NavLink>)}</nav><button onClick={async()=>{try{await logout();}catch(e){setMessage(errorText(e));}}}><LogOut size={16}/>Sign out</button></header>{message&&<p role="alert">{message}</p>}<div className="workBody"><Outlet/></div></div>;
}
