import React,{useRef,useState} from 'react';
import api from '../services/api';
import {PageHeading,Select,Input,ErrorState,LoadingState,Empty,pairs,items,useResource,useOptions,message} from './WorkspaceShared';
const groups=[['villages','Villages'],['wards','Wards'],['users','People'],['assignments','Assignments'],['audit','Audit history']];
const targets=[['households','Households'],['infrastructure','Infrastructure locations'],['farmers','Farmer interactions'],['shgs','Self-help groups'],['consultations','Panchayat consultations'],['students','Students']];
const initial={households:0,infrastructure:30,farmers:15,shgs:5,consultations:3,students:25};
const roleOptions=[['admin','Administrator (Full access)'],['surveyor','Surveyor / student'],['viewer','Faculty coordinator']];
function Form({kind,editing,setEditing,options,onWrite,working}) {
  const [v,setV]=useState(()=>({...editing, name:editing?.name || '', email:editing?.email || '', password:'',role:editing?.role || 'surveyor',village:editing?.village || '',user:editing?.user || '',team:editing?.team || '',targets:{...initial,...editing?.targets}}));
  const set=(k,x)=>setV({...v,[k]:x});
  const title=(editing?'Edit ':'Create ')+({villages:'village',wards:'ward',users:'account',assignments:'assignment'}[kind]);
  const optionsUsers=(options.users || []).filter(u=>u.role==='surveyor'&&u.active!==false).map(u=>[u._id,u.name+' · '+(u.publicId||u.email)]);
  const submit=async event=>{
    event.preventDefault();
    const payload=kind==='villages'?{name:v.name,targets:Object.fromEntries(Object.entries(v.targets).map(([k,x])=>[k,Number(x)]))}
      :kind==='wards'?(editing?{name:v.name}:{name:v.name,village:v.village})
      :kind==='users'?(editing?{name:v.name,role:v.role,...(v.password?{password:v.password}:{})}:{name:v.name,email:v.email,password:v.password,role:v.role})
      :{user:v.user,village:v.village,...(v.team?{team:v.team}:{})};
    await onWrite(editing?'patch':'post','/'+kind+(editing?'/'+editing._id:''),payload,title+' completed.');
  };
  return <form className="ws-panel" onSubmit={submit}><h3>{title}</h3>
    {kind!=='assignments'&&<Input label={kind==='users'?'Display name':'Name'} value={v.name} maxLength={100} required onChange={e=>set('name',e.target.value)}/>}
    {kind==='villages'&&<fieldset className="ws-fields"><legend>Pilot targets</legend>{targets.map(([key,label])=><Input key={key} label={label} type="number" min="0" max="1000000" required value={v.targets[key]} onChange={e=>set('targets',{...v.targets,[key]:e.target.value})}/>)}</fieldset>}
    {((kind==='wards'&&!editing)||kind==='assignments') && <Select label="Village" options={pairs(options.villages)} all="Choose village" value={v.village} onChange={x=>set('village',x)} required/>}
    {kind==='users'&&<>{!editing&&<Input label="Email" type="email" autoComplete="off" required value={v.email} onChange={e=>set('email',e.target.value)}/>}
      <Select label="Role" options={roleOptions} value={v.role} required onChange={x=>set('role',x)}/>
      <Input label={editing?"New password (leave blank to keep current)":"Initial password"} type="password" autoComplete="new-password" required={!editing} minLength={12} maxLength={128} value={v.password} onChange={e=>set('password',e.target.value)}/></>}
    {kind==='assignments'&&<><Select label="Surveyor" options={optionsUsers} all="Choose surveyor" required value={v.user} onChange={x=>set('user',x)}/><Input label="Team (optional)" value={v.team} maxLength={80} onChange={e=>set('team',e.target.value)}/></>}
    <button type="submit" className="ws-primary" disabled={working}>{working?'Saving…':editing?'Save changes':title}</button>
    {editing&&<button type="button" onClick={()=>setEditing(null)}>Cancel</button>}
  </form>
}
const cols={
 villages:['Village','Targets','Action'],wards:['Ward','Village','Action'],users:['Name','Role','Account','Action'],assignments:['Surveyor','Village','Team','Action'],audit:['Time','Action','Record','Changed by','Change history']
};
function labelById(options,value){
  if(typeof value==='object'&&value) return value.name||value.publicId||value._id;
  const row=options?.find(row=>row._id===value);
  return row?.name||row?.publicId||value||'—';
}
export default function Admin(){
  const [kind,setKind]=useState('villages'),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[editing,setEditing]=useState(null);
  const [notice,setNotice]=useState(''),[error,setError]=useState(''),[working,setWorking]=useState(false),[confirm,setConfirm]=useState(null);
  const lock=useRef(false);
  const list=useResource('/'+kind,{page,limit:20},revision);
  const villages=useOptions(kind==='wards'||kind==='assignments'?'/villages':null,{},revision);
  const users=useOptions(kind==='assignments'||kind==='audit'?'/users':null,{},revision);
  const reset=key=>{setKind(key);setPage(1);setEditing(null);setNotice('');setError('');setConfirm(null)};
  const write=async(method,path,data,success)=>{
    if(lock.current) return;
    lock.current=true;setWorking(true);setError('');setNotice('');
    try{await api.request({method,url:path,data});setNotice(success);setEditing(null);setConfirm(null);setRevision(x=>x+1);setPage(1);}
    catch(e){setError(message(e));}
    finally{lock.current=false;setWorking(false);}
  };
  const edit=row=>{setEditing(row);setConfirm(null);setNotice('');setError('')};
  const rows=items(list.data);
  const values=row=>{
    if(kind==='villages')return [row.name,targets.map(([k,t])=>row.targets?.[k]>0?t+' '+row.targets[k]:null).filter(Boolean).join(' · ')||'—',<button onClick={()=>edit(row)}>Edit</button>];
    if(kind==='wards')return [row.name,labelById(villages.data,row.village),<button onClick={()=>edit(row)}>Edit</button>];
    if(kind==='users')return [<>{row.name}<br/><small>{row.email} · {row.publicId}</small></>,row.role==='admin'?'Administrator':row.role==='viewer'?'Faculty coordinator':'Surveyor',row.active?'Active':'Inactive',<div key={row._id} style={{display:'inline-flex',gap:'0.4rem'}}><button type="button" onClick={()=>edit(row)}>Edit</button><button type="button" onClick={()=>setConfirm(row)}>{row.active?'Deactivate':'Activate'}</button></div>];
    if(kind==='assignments')return [labelById(users.data,row.user),labelById(villages.data,row.village),row.team||'—',<button onClick={()=>setConfirm(row)}>Remove</button>];
    return [new Date(row.createdAt).toLocaleString(),row.action,<>{row.kind}<br/><small>{row.record||row.publicId}</small></>,labelById(users.data,row.createdBy),row.changes&&Object.keys(row.changes).length?<details><summary>View changes</summary><pre className="ws-changes">{JSON.stringify(row.changes,null,2)}</pre></details>:'—'];
  };
  return <main className="ws-page"><PageHeading eyebrow="Super administrator" title="Administration">Manage fieldwork locations, pilot targets and surveyor access.</PageHeading>
    <div className="ws-tabs">{groups.map(([key,title])=><button key={key} type="button" disabled={working} aria-pressed={key===kind} onClick={()=>reset(key)}>{title}</button>)}</div>
    {notice&&<p className="ws-notice" role="status">{notice}</p>}
    {(error||users.error||villages.error)&&<ErrorState error={error||users.error||villages.error} onRetry={()=>{setError('');setRevision(x=>x+1)}}/>}
    {confirm&&<section className="ws-panel"><h3>{kind==='assignments'?'Remove this fieldwork assignment?':(confirm.active?'Deactivate ':'Activate ')+confirm.name+'?'}</h3><div className="ws-toolbar"><button className="ws-primary" disabled={working} onClick={()=>kind==='assignments'?write('delete','/assignments/'+confirm._id,undefined,'Assignment removed.'):write('patch','/users/'+confirm._id,{active:!confirm.active},'Account updated.')}>Confirm</button><button disabled={working} onClick={()=>setConfirm(null)}>Cancel</button></div></section>}
    <div className={kind==='audit'?'':'ws-admin-grid'}>{kind!=='audit'&&<Form key={[kind,editing?._id,revision].join('-')} kind={kind} editing={editing} setEditing={setEditing} working={working} options={{villages:villages.data,users:users.data}} onWrite={write}/>}
    <section className="ws-panel"><h3>{groups.find(([k])=>k===kind)[1]}</h3>{list.error?<ErrorState error={list.error} onRetry={()=>setRevision(x=>x+1)}/>:list.loading?<LoadingState/>:rows.length?<div className="ws-table-wrap"><table><thead><tr>{cols[kind].map(c=><th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row._id}>{values(row).map((v,i)=><td key={i}>{v}</td>)}</tr>)}</tbody></table></div>:<Empty>No records yet.</Empty>}
    {(list.data?.total>20||page>1)&&<nav className="ws-pager" aria-label="Record pages"><button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page}</span><button disabled={page*20>=list.data?.total} onClick={()=>setPage(page+1)}>Next</button></nav>}</section></div>
  </main>;
}
