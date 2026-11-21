import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ClipboardList, Plus, Search } from 'lucide-react';
import { modules } from '../../../shared/forms';
import api from '../services/api';
import { useAuth } from '../context/Auth';
import { Empty, ErrorState, LoadingState, PageHeading, Select, message, useResource } from '../pages/WorkspaceShared';
import { objectId, show, useChoices } from './helpers';
import './forms.css';

const path = (m,id='') => '/records/'+m.key+(id ? '/'+id : '');
const label = (choices,x) => choices.find(v=>v._id===objectId(x))?.name || x?.name || '—';
const standardStatuses = ['Draft','Submitted','Verified'];
const problemStatuses = ['Draft','Submitted','Under Review','Verified','Duplicate','Resolved'];
function Badge({value}) {return <span className={'vf-badge vf-'+value.toLowerCase().replace(' ','-')}>{value}</span>;}

export default function Records() {
  const {kind,id} = useParams(), {user} = useAuth();
  const mod=modules[kind];
  if (!mod || user?.role === 'viewer') return <main className="vf-wrap"><h1>Individual records are restricted</h1><Link to="/dashboard">View survey statistics</Link></main>;
  return id ? <Detail key={kind+id} mod={mod} id={id} user={user}/> : <RecordList key={kind} mod={mod}/>;
}
function RecordList({mod}) {
  const [page,setPage] = useState(1), [search,setSearch] = useState(''), [q,setQ] = useState(''), [status,setStatus] = useState(''), [village,setVillage] = useState(''), [ward,setWard] = useState('');
  const [attempt,reload]=useState(0);
  const villages=useChoices('/villages'), wards=useChoices(village?'/wards?village='+village:'/wards');
  useEffect(()=>{const t=setTimeout(()=>{setQ(search.trim());setPage(1);},350);return ()=>clearTimeout(t);},[search]);
  const filters=Object.fromEntries(Object.entries({page,limit:15,search:q,status,village,ward}).filter(([,v])=>v!==''));
  const result = useResource(mod.endpoint,filters,attempt);
  return <main className="vf-wrap"><PageHeading eyebrow="Field records" title={mod.title} action={<Link className="vf-primary" to={'/surveys/'+mod.key+'/new'}><Plus size={17}/>Create record</Link>}/>
    <nav aria-label="Record categories" className="vf-tabs">{Object.values(modules).map(m=><Link aria-current={m.key===mod.key?'page':undefined} to={path(m)} key={m.key}>{m.title}</Link>)}</nav>
    <div className="vf-card"><div className="vf-filter">
    <label className="vf-field"><span><Search size={15}/> Search reference</span><input type="search" value={search} placeholder="Record reference" onChange={e=>setSearch(e.target.value)}/></label>
    <Select label="Village" value={village} options={villages.items.map(x=>[x._id,x.name])} onChange={v=>{setVillage(v);setWard('');setPage(1);}}/>
    <Select label="Ward" value={ward} options={wards.items.map(x=>[x._id,x.name])} onChange={v=>{setWard(v);setPage(1);}}/>
    <Select label="Record status" value={status} options={mod.key==='problems'?problemStatuses:standardStatuses} onChange={v=>{setStatus(v);setPage(1);}}/></div>
    {villages.error && <ErrorState error={villages.error} onRetry={villages.retry}/>}
    {wards.error && <ErrorState error={wards.error} onRetry={wards.retry}/>}
    {result.loading?<LoadingState/>:result.error?<ErrorState error={result.error} onRetry={()=>reload(a=>a+1)}/>:!result.data?.items?.length?<Empty>No records match this selection.</Empty>:
    <><div className="vf-scroll"><table><thead><tr>{['Reference','Village','Ward','Survey date','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>
    {result.data.items.map(r=><tr key={r._id}><td><Link to={path(mod,r._id)}>{r.publicId}</Link></td><td>{label(villages.items,r.village)}</td><td>{label(wards.items,r.ward)}</td><td>{r.surveyDate.slice(0,10)}</td><td><Badge value={r.status}/></td></tr>)}</tbody></table></div>
    <div className="vf-pagination"><button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</button><span>Page {page} of {Math.max(1,Math.ceil(result.data.total/15))}</span><button disabled={page*15>=result.data.total} onClick={()=>setPage(page+1)}>Next</button></div></>}
    </div></main>;
}
function Detail({mod,id,user}) {
  const [revision,reload] = useState(0), [status,setStatus] = useState(''), [busy,setBusy] = useState(false), [error,setError] = useState('');
  const endpoint=mod.endpoint+'/'+id;
  const result=useResource(endpoint,{},revision);
  const record=result.data;
  const village=useResource(record?'/villages/'+objectId(record.village):null);
  const wards=useChoices(record?'/wards?village='+objectId(record.village):null);
  const audit=useResource(record && user.role==='admin'?'/audit':null,{record:id,page:1,limit:100},revision);
  const [photoUrl,setPhotoUrl]=useState('');
  useEffect(()=>{
    if(!record?.hasPhoto)return;
    const cancel=new AbortController();let objectUrl;
    api.get(endpoint+'/photo',{responseType:'blob',signal:cancel.signal}).then(({data})=>{
      if(!cancel.signal.aborted){objectUrl=URL.createObjectURL(data);setPhotoUrl(objectUrl);}
    }).catch(e=>{if(!cancel.signal.aborted)setError(message(e));});
    return ()=>{cancel.abort();if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[endpoint,record?.hasPhoto]);
  if(result.loading)return <LoadingState/>;
  if(result.error)return <ErrorState error={result.error} onRetry={()=>reload(n=>n+1)}/>;
  if(!record)return <Empty>Record unavailable.</Empty>;
  const canEdit = user.role==='admin' || (record.status==='Draft' && objectId(record.createdBy)===user._id);
  const states=(mod.key==='problems'?problemStatuses:standardStatuses).filter(s=>s!=='Draft' && s!==record.status && s!=='Submitted');
  async function review() {
    if(!status)return;
    setBusy(true);setError('');
    try {await api.patch(endpoint+'/status',{status,revision:record.__v});setStatus('');reload(n=>n+1);}
    catch(e){setError(message(e));}finally{setBusy(false);}
  }
  return <main className="vf-wrap"><Link className="vf-back" to={path(mod)}>Back to {mod.title.toLowerCase()}</Link>
    <PageHeading eyebrow={mod.singular} title="Record details" action={canEdit && <Link className="vf-primary" to={path(mod,id)+'/edit'}>Edit record</Link>}/>
    <section className="vf-card"><div className="vf-meta"><ClipboardList size={18}/><strong>{record.publicId}</strong><Badge value={record.status}/></div>
    <dl className="vf-summary">{Object.entries({'Village':village.data?.name,'Ward':label(wards.items,record.ward),'Survey date':record.surveyDate.slice(0,10),'Created':new Date(record.createdAt).toLocaleString(),'Surveyor':record.createdBy?.publicId || objectId(record.createdBy)}).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v||'—'}</dd></div>)}</dl>
    {mod.sections.map(s=><details className="vf-details" key={s.title} open={mod.sections.length<4}><summary>{s.title}</summary><dl>{s.fields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{String(show(record.data[f.key]))}</dd></div>)}</dl></details>)}
    {photoUrl && <figure><img src={photoUrl} alt="Private photograph submitted with this observation" loading="lazy" style={{maxWidth:'100%',maxHeight:420}}/></figure>}
    {user.role==='admin' && record.status!=='Draft' && states.length>0 && <div className="vf-review"><Select label="Verification status" value={status} options={states} all="Choose status" onChange={setStatus}/><button type="button" className="vf-primary" disabled={!status||busy} onClick={review}>Update status</button></div>}
    {error && <ErrorState error={error}/>}</section>
    {user.role==='admin' && <section className="vf-card"><h2>Audit history</h2>{audit.loading?<LoadingState/>:audit.error?<ErrorState error={audit.error}/>:<ol className="vf-audit">{audit.data?.items?.map(item=><li key={item._id}><strong>{item.action}</strong><time>{new Date(item.createdAt).toLocaleString()}</time>{item.changes && <details><summary>Change details</summary><pre>{JSON.stringify(item.changes,null,2)}</pre></details>}</li>)}</ol>}</section>}</main>;
}
