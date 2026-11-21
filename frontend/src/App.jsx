import {Suspense,lazy} from 'react';
import {Routes,Route,Navigate,Link} from 'react-router-dom';
import {useAuth} from './context/Auth';
import Workspace,{Pending} from './layouts/Workspace';
import Home from './pages/Home';
const Login=lazy(()=>import('./pages/Login')), Dashboard=lazy(()=>import('./pages/Dashboard')),Reports=lazy(()=>import('./pages/Reports')),Admin=lazy(()=>import('./pages/Admin')),Fieldwork=lazy(()=>import('./pages/Fieldwork')),Form=lazy(()=>import('./forms/SurveyForm')),Records=lazy(()=>import('./forms/Records'));
function Allow({roles,children}){return roles.includes(useAuth().user?.role)?children:<Navigate to="/dashboard" replace/>;}
const field=['admin','surveyor'];
export default function App(){return <Suspense fallback={<Pending/>}><Routes><Route path="/" element={<Home/>}/><Route path="/login" element={<Login/>}/><Route element={<Workspace/>}><Route path="/dashboard" element={<Dashboard/>}/><Route path="/reports" element={<Allow roles={['admin','viewer']}><Reports/></Allow>}/><Route path="/admin" element={<Allow roles={['admin']}><Admin/></Allow>}/><Route path="/workspace" element={<Allow roles={field}><Fieldwork/></Allow>}/>{['/surveys/:kind/new','/records/:kind/:id/edit'].map(path=><Route key={path} path={path} element={<Allow roles={field}><Form key={path}/></Allow>}/>)}{['/records/:kind','/records/:kind/:id'].map(path=><Route key={path} path={path} element={<Allow roles={field}><Records/></Allow>}/>)}</Route><Route path="*" element={<main className="offline"><h1>Page not found</h1><Link to="/">Return home</Link></main>}/></Routes></Suspense>;}
