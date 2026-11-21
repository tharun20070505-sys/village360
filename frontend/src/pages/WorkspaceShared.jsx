import React, { useEffect, useState } from 'react';
import { AlertCircle, Filter, RefreshCcw } from 'lucide-react';
import api,{errorText} from '../services/api';
import {categories} from '../../../shared/forms';
import './workspace.css';

export const message=errorText;
export function useResource(path, params = {}, revision = 0) {
  const key = JSON.stringify(params);
  const identity = JSON.stringify([path,key,revision]);
  const [state,setState] = useState({});
  useEffect(() => {
    if (!path) return;
    const cancel = new AbortController();
    api.get(path, { params: JSON.parse(key), signal: cancel.signal })
      .then(({data}) => { if (!cancel.signal.aborted) setState({data,identity}); })
      .catch(error => { if (!cancel.signal.aborted) setState({error:message(error),identity}); });
    return () => cancel.abort();
  },[path,key,revision,identity]);
  if (!path) return {data:null};
  return state.identity === identity ? state : {loading:true};
}

export function ErrorState({error,onRetry}) {
  return <div className="ws-error" role="alert"><AlertCircle size={19}/><span>{error}</span>{onRetry && <button type="button" onClick={onRetry}><RefreshCcw size={15}/>Retry</button>}</div>;
}
export function LoadingState() {
  return <div className="ws-loader" role="status" aria-label="Loading data"><span/><span/><span/></div>;
}
export function PageHeading({eyebrow,title,children,action}) {
  return <header className="ws-page-header"><div><span className="ws-eyebrow">{eyebrow}</span><h1>{title}</h1>{children && <p>{children}</p>}</div>{action}</header>;
}
export function FilterBar({children,onClear}) {
  return <section className="ws-filters" aria-label="Filters"><div className="ws-section-label"><Filter size={16}/> Filters <button onClick={onClear} type="button">Reset</button></div><div className="ws-grid-fields">{children}</div></section>;
}
export function Select({label,value,onChange,options,all='All',...rest}) {
  return <label className="ws-label">{label}<select value={value || ''} onChange={e=>onChange(e.target.value)} {...rest}><option value="">{all}</option>{options.map(option=>{const [key,text] = Array.isArray(option) ? option : [option,option];return <option value={key} key={key}>{text}</option>})}</select></label>;
}
export function Input({label,...props}) {
  return <label className="ws-label">{label}<input {...props}/></label>;
}
export function Empty({children='No records match these filters.'}) {
  return <p className="ws-empty">{children}</p>;
}
export function pairs(rows) {
  return (rows || []).map(row=>[row._id,row.name || row.publicId]);
}
export function items(response) {
  return Array.isArray(response) ? response : response?.items || [];
}

export const types = [['households','Household survey'],['problems','Village problem'],['infrastructure','Infrastructure observation'],['farmers','Farmer survey'],['shgs','Self-help group'],['consultations','Panchayat consultation'],['students','Student participation']];
export const problemCategories=categories;
export const statuses = ['Submitted','Under Review','Verified','Duplicate','Resolved'];
export const blankFilters = {village:'',ward:'',from:'',to:'',type:'',category:'',status:''};
export function query(filters) { return Object.fromEntries(Object.entries(filters).filter(([,value])=>value!=='' && value!=null)); }

export function useOptions(path, params = {}, revision = 0) {
  const key = JSON.stringify(params);
  const identity = JSON.stringify([path,key,revision]);
  const [state,setState] = useState({});
  useEffect(()=>{
    if (!path) return;
    const controller=new AbortController();
    async function load() {
      const found=[];
      for(let page=1;;page++){
        const response=await api.get(path,{params:{...JSON.parse(key),limit:100,page},signal:controller.signal});
        const batch=items(response.data);
        found.push(...batch);
        if(!batch.length || found.length >= (response.data.total ?? found.length)) break;
      }
      if(!controller.signal.aborted) setState({identity,data:found});
    }
    load().catch(error=>{if(!controller.signal.aborted) setState({identity,error:message(error)});});
    return ()=>controller.abort();
  },[path,key,identity]);
  if(!path) return {data:[]};
  return state.identity===identity?state:{loading:true};
}
export function SurveyFilters({value,onChange,showType=true,showProblems=true}) {
  const [rev,setRev]=useState(0);
  const villages=useOptions('/villages',{},rev);
  const wards=useOptions(value.village?'/wards':null,{village:value.village},rev);
  const change=(field,next)=>onChange({...value,[field]:next,...(field==='village'?{ward:''}:{})});
  return <FilterBar onClear={()=>onChange({...blankFilters})}>
    <Select label="Village" value={value.village} options={pairs(villages.data)} onChange={v=>change('village',v)}/>
    <Select label="Ward" value={value.ward} options={pairs(wards.data)} disabled={!value.village} all={value.village?'All wards':'Choose village first'} onChange={v=>change('ward',v)}/>
    <Input label="From survey date" type="date" max={value.to||undefined} value={value.from} onChange={e=>change('from',e.target.value)}/>
    <Input label="Through survey date" type="date" min={value.from||undefined} value={value.to} onChange={e=>change('to',e.target.value)}/>
    {showType && <Select label="Survey type" value={value.type} options={types} onChange={v=>change('type',v)}/>}
    {showProblems && <Select label="Problem category" value={value.category} options={problemCategories} onChange={v=>change('category',v)}/>}
    <Select label="Verification status" value={value.status} options={statuses} onChange={v=>change('status',v)}/>
    {(villages.error||wards.error) && <ErrorState error={villages.error||wards.error} onRetry={()=>setRev(rev+1)}/>}
  </FilterBar>;
}
