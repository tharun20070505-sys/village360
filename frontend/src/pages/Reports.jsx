import React,{useState} from 'react';
import {Download, FileText} from 'lucide-react';
import api from '../services/api';
import {PageHeading,SurveyFilters,blankFilters,useResource,query,LoadingState,ErrorState,Empty,message} from './WorkspaceShared';
const reports=[['households','Households'],['problems','Village problems'],['infrastructure','Infrastructure'],['progress','Surveyor progress']];
export default function Reports(){
  const [type,setType]=useState('households'),[filters,setFilters]=useState({...blankFilters}),[revision,setRevision]=useState(0);
  const [pending,setPending]=useState(''),[error,setError]=useState('');
  const params=query(filters);
  const report=useResource('/reports/'+type,params,revision);
  async function download(format){
    setPending(format);setError('');
    try{
      const response=await api.get('/reports/export',{params:{...params,type,format},responseType:'blob'});
      const url=URL.createObjectURL(response.data), anchor=document.createElement('a');
      anchor.href=url;anchor.download='village360-'+type+'-'+new Date().toISOString().slice(0,10)+'.'+format;
      document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    }catch(e){
      if(e.response?.data instanceof Blob){
        try{e.response.data=JSON.parse(await e.response.data.text());}catch{/* Fallback to connection message. */}
      }
      setError(message(e));
    }finally{setPending('');}
  }
  const info=report.data;
  return <main className="ws-page ws-report"><PageHeading eyebrow="Research outputs" title="Reports">Summaries for village development research, grouped by field observations and verification status.</PageHeading>
    <div className="ws-no-print"><div className="ws-tabs" aria-label="Report type">{reports.map(([key,label])=><button type="button" key={key} aria-pressed={key===type} onClick={()=>{setType(key);setFilters({...filters,category:'',status:''});setError('')}}>{label}</button>)}</div>
    <SurveyFilters value={filters} onChange={setFilters} showType={false} showProblems={type==='problems'}/></div>
    {report.error && <ErrorState error={report.error} onRetry={()=>setRevision(x=>x+1)}/>}
    {report.loading && <LoadingState/>}
    {info && <section className="ws-panel"><header className="ws-page-header"><div><span className="ws-eyebrow">Survey report</span><h2>{info.title}</h2></div><div className="ws-toolbar ws-no-print">{['csv','pdf'].map(format=><button type="button" key={format} onClick={()=>download(format)} disabled={!!pending}>{format==='csv'?<Download size={16}/>:<FileText size={16}/>} {pending===format?'Preparing…':format.toUpperCase()}</button>)}</div></header>
    {error && <ErrorState error={error}/>}
    <div className="ws-stats"><article className="ws-metric"><div>Sample size</div><b>{info.sampleSize}</b></article><article className="ws-metric"><div>Survey dates</div><strong>{info.from?String(info.from).slice(0,10):'Earliest available'} — {info.to?String(info.to).slice(0,10):'Latest available'}</strong></article><article className="ws-metric"><div>Generated</div><strong>{new Date(info.generatedAt).toLocaleString()}</strong></article></div>
    {info.rows?.length ? <div className="ws-table-wrap"><table><thead><tr><th scope="col">Finding</th><th scope="col">Count</th></tr></thead><tbody>{info.rows.map((row,i)=><tr key={row.name+'-'+i}><th scope="row">{row.name}</th><td>{row.value}</td></tr>)}</tbody></table></div>:<Empty>No observations match this report.</Empty>}
    <h3 style={{marginTop:'1.2rem'}}>Reading this report</h3><p>{Array.isArray(info.limitations)?info.limitations.join(' '):info.limitations}</p></section>}
  </main>;
}
