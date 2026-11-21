import React, { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, ClipboardList, MapPin, Save } from 'lucide-react';
import { modules, schemas, draftSchemas } from '../../../shared/forms';
import api from '../services/api';
import { useAuth } from '../context/Auth';
import { ErrorState, LoadingState, PageHeading, message, useResource } from '../pages/WorkspaceShared';
import { clean, objectId, show, today, uploadPhoto, useChoices } from './helpers';
import './forms.css';

function Field({field:f,register,error,disabled}) {
  const id = 'field-' + f.key;
  const shared = { id, disabled, 'aria-invalid':!!error, 'aria-describedby':error ? id+'-error':undefined };
  const numeric = f.type === 'coordinate' || f.type === 'number';
  const bind = register('data.'+f.key,numeric ? {setValueAs:v=>v === '' || v == null ? undefined : Number(v)} : {});
  if (f.type === 'checkbox') return <label className="vf-check" htmlFor={id}><input {...shared} {...bind} type="checkbox"/><span>{f.label}{error && <small id={id+'-error'}>{error}</small>}</span></label>;
  return <div className={'vf-field '+(f.type === 'textarea'?'vf-wide':'')}><label htmlFor={id}>{f.label}{f.optional && <em>Optional</em>}</label>
    {f.type === 'select' ? <select {...shared} {...bind}><option value="">Choose an option</option>{f.options.map(value=><option key={value}>{value}</option>)}</select> :
    f.type === 'textarea' ? <textarea {...shared} {...bind} rows="3" maxLength={f.max || 1000}/> :
    <input {...shared} {...bind} type={numeric?'number':'text'} step={f.type === 'coordinate'?'any':undefined} min={f.min} max={numeric?f.max:undefined} maxLength={numeric?undefined:160}/>}
    {error && <small id={id+'-error'}>{error}</small>}</div>;
}

export default function SurveyForm() {
  const {kind,id} = useParams();
  const {user} = useAuth();
  const mod = modules[kind];
  const [rev,reload] = useState(0);
  const saved = useResource(id && mod ? mod.endpoint+'/'+id : null,{},rev);
  if (!mod || user?.role === 'viewer') return <p>This form is unavailable.</p>;
  if (id && saved.loading) return <LoadingState/>;
  if (id && saved.error) return <ErrorState error={saved.error} onRetry={()=>reload(x=>x+1)}/>;
  return <Editor key={[user?._id,kind,id].join(':')} mod={mod} record={saved.data} user={user}/>;
}

function Editor({mod,record,user}) {
  const key = 'v360.draft.' + [user._id || user.publicId,mod.key,record?._id || 'new'].join('.');
  const [draft, setDraft] = useState(()=>{try {return JSON.parse(localStorage.getItem(key));} catch {return null;}});
  const [requestKey,setRequestKey] = useState(()=>crypto.randomUUID());
  const [step,setStep] = useState(0), [notice,setNotice] = useState(''), [error,setError] = useState(''), [issues,setIssues] = useState({});
  const [busy,setBusy] = useState(false), [done,setDone] = useState(null), [file,setFile] = useState(null);
  const writeLock = useRef(false);
  const last = mod.sections.length;
  const defaults = {village:objectId(record?.village),ward:objectId(record?.ward),surveyDate:record?.surveyDate?.slice(0,10)||today(),data:{...record?.data,accuracy:false}};
  const {register,watch,reset,getValues,setValue} = useForm({defaultValues:defaults, shouldUnregister:false});
  const village = watch('village'), gpsConsent = watch('data.gpsConsent'), photoConsent = watch('data.photoConsent');
  const villages = useChoices('/villages'), wards = useChoices(village ? '/wards?village='+encodeURIComponent(village) : null);
  const heading = useRef(null), previousStep = useRef(step);
  useEffect(()=>{if(previousStep.current !== step) {heading.current?.focus(); previousStep.current=step;}},[step]);
  const atReview = step === last;
  const fields = mod.sections[step]?.fields || [];
  const modHasPhoto = ['problems','infrastructure'].includes(mod.key);
  const currentValues = () => {
    const v = getValues(), data = clean(v.data);
    if (!data.gpsConsent) {delete data.latitude; delete data.longitude;}
    return {village:v.village,ward:v.ward,surveyDate:v.surveyDate,data};
  };
  function clearDraft() { try {localStorage.removeItem(key);} catch {} setDraft(null); }
  function localSave() {
    try {
      const value = {version:1,date:Date.now(),step,requestKey,updatedAt:record?.updatedAt,values:currentValues()};
      localStorage.setItem(key,JSON.stringify(value));
      setDraft(value);setNotice('Draft saved on this device. It has not been uploaded.');setError('');
    } catch {setError('Device storage is unavailable. Keep this page open and upload when connected.');}
  }
  function restore() {
    if(draft.version !== 1 || draft.updatedAt !== record?.updatedAt){setError('This draft belongs to an earlier record version. Review the current record before editing.');return;}
    reset(draft.values);setRequestKey(draft.requestKey || crypto.randomUUID());setStep(Math.min(draft.step || 0,last));setNotice('Device draft restored.');setError('');
  }
  function validate(stage,onlyCurrent=false) {
    const v = currentValues();
    const errs = {};
    if (!v.village) errs.village='Choose a village';
    if (!v.ward) errs.ward='Choose a ward';
    if (!v.surveyDate || v.surveyDate > today()) errs.surveyDate='Choose today or an earlier date';
    const parsed = (stage === 'Draft' ? draftSchemas : schemas)[mod.key].safeParse(v.data);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const name=issue.path[0];
        if (!onlyCurrent || fields.some(f=>f.key === name)) errs[name] = issue.code === 'custom' ? issue.message : 'Check this answer';
      }
    }
    setIssues(errs);
    if(Object.keys(errs).length){
      if (!onlyCurrent) {
        const target = errs.village || errs.ward || errs.surveyDate ? 0 : mod.sections.findIndex(s=>s.fields.some(f=>errs[f.key]));
        if(target >= 0) setStep(target);
      }
      setError('Please check the highlighted fields.');return null;
    }
    setError('');
    return {...v,data:parsed.success?parsed.data:v.data};
  }
  async function submit(status) {
    if(writeLock.current)return;
    const values = validate(status);
    if(!values)return;
    writeLock.current=true;setBusy(true);setNotice('');
    let stored;
    try {
      const body={...values,status};
      if(record) body.revision=record.__v;
      stored = (record ? await api.patch(mod.endpoint+'/'+record._id,body) : await api.post(mod.endpoint,body,{headers:{'Idempotency-Key':requestKey}})).data;
      clearDraft();
      if(file && photoConsent) await uploadPhoto(mod.endpoint,stored._id,file);
      setDone(stored);
    } catch(e) {
      if(stored) {setDone(stored);setError('The record was saved, but its photograph was not uploaded. '+message(e));}
      else setError(message(e));
    } finally {writeLock.current=false;setBusy(false);}
  }
  async function retryPhoto() {
    setBusy(true);
    try {await uploadPhoto(mod.endpoint,done._id,file);setError('');}
    catch(e){setError('Photo upload failed. '+message(e));}finally{setBusy(false);}
  }
  const human = (list,id) => list.items.find(i=>i._id===id)?.name || id || '—';
  if(done) return <section className="vf-wrap"><div className="vf-card vf-success"><CheckCircle2 size={38}/><h1>{done.status==='Draft'?'Draft saved to server':'Record saved'}</h1><p>Your {mod.singular.toLowerCase()} reference</p><strong>{done.publicId}</strong>{error && <ErrorState error={error} onRetry={busy?undefined:retryPhoto}/>}<Link className="vf-primary" to={'/records/'+mod.key+'/'+done._id}>View saved record</Link></div></section>;
  const info = <div className="vf-grid">
    <div className="vf-field"><label htmlFor="village">Village</label><select id="village" {...register('village',{onChange:()=>setValue('ward','')})}><option value="">Select village</option>{villages.items.map(v=><option key={v._id} value={v._id}>{v.name}</option>)}</select>{issues.village && <small>{issues.village}</small>}</div>
    <div className="vf-field"><label htmlFor="ward">Ward</label><select id="ward" disabled={!village} {...register('ward')}><option value="">Select ward</option>{wards.items.map(w=><option key={w._id} value={w._id}>{w.name}</option>)}</select>{issues.ward && <small>{issues.ward}</small>}</div>
    <div className="vf-field"><label htmlFor="survey-date">{mod.key==='consultations'?'Consultation date':mod.key==='problems'?'Date reported':'Survey date'}</label><input id="survey-date" type="date" max={today()} {...register('surveyDate')}/>{issues.surveyDate && <small>{issues.surveyDate}</small>}</div>
    <div className="vf-field"><label htmlFor="surveyor-id">Surveyor ID</label><input id="surveyor-id" readOnly value={record?.createdBy?.publicId || (record && objectId(record.createdBy)) || user.publicId || user._id}/></div>
    {villages.error && <ErrorState error={villages.error} onRetry={villages.retry}/>}
    {wards.error && <ErrorState error={wards.error} onRetry={wards.retry}/>}
    {!villages.loading && !villages.error && !villages.items.length && <p className="vf-hint vf-wide">Your account has no available villages. Ask the project administrator for an assignment.</p>}
  </div>;
  return <main className="vf-wrap">
    <PageHeading eyebrow="Field collection" title={mod.singular}>{record?'Editing '+record.publicId:'A reference ID is generated when the server saves your record.'}</PageHeading>
    {draft && !notice && <div className="vf-callout"><Save size={18}/><div>A device draft is available from {new Date(draft.date).toLocaleString()}. <button type="button" onClick={restore}>Restore draft</button> · <button type="button" onClick={clearDraft}>Discard device copy</button></div></div>}
    <div className="vf-layout"><aside className="vf-progress"><span className="vf-kicker"><ClipboardList size={16}/> Survey progress</span><p>Step {step+1} of {last+1}</p><progress max={last+1} value={step+1}/><ol>{[...mod.sections,{title:'Review and submit'}].map((s,i)=><li key={s.title} aria-current={i===step?'step':undefined}><span>{i+1}</span>{s.title}</li>)}</ol></aside>
    <form className="vf-card" noValidate onSubmit={e=>{e.preventDefault();if(atReview)submit(record && !['Draft','Submitted'].includes(record.status)?record.status:'Submitted');else if(validate('Submitted',true)){setStep(step+1);setNotice('');}}}>
    <h2 tabIndex="-1" ref={heading}>{atReview ? 'Review and submit' : mod.sections[step].title}</h2>
    {step === 0 && info}
    {!atReview && <div className="vf-grid">{fields.map(f=><Field key={f.key} field={f} register={register} error={issues[f.key]} disabled={['latitude','longitude'].includes(f.key) && !gpsConsent}/>)}
    {modHasPhoto && fields.some(f=>f.key==='photoConsent') && <div className="vf-field vf-wide"><label htmlFor="photo">Site photograph <em>Optional</em></label><input id="photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={!photoConsent} onChange={e=>{const f=e.target.files?.[0];if(f && f.size > 2*1024*1024){e.target.value='';setFile(null);setError('Choose an image under 2 MB.');}else{setFile(f);setError('');}}}/><p className="vf-hint">JPEG, PNG or WebP, up to 2 MB. Avoid faces, house numbers and personal documents. Reselect the file after restoring a device draft.</p></div>}</div>}
    {atReview && <><p className="vf-meta"><MapPin size={16}/>{human(villages,village)} · {human(wards,getValues('ward'))} · {getValues('surveyDate')}</p>
    {mod.sections.map((s,i)=><details key={s.title} className="vf-details" open={i===0}><summary>{s.title}</summary><dl>{s.fields.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{String(show(currentValues().data[f.key]))}</dd></div>)}</dl><button type="button" onClick={()=>setStep(i)}>Edit section</button></details>)}
    <label className="vf-check"><input type="checkbox" {...register('data.accuracy')}/>I have reviewed the answers and confirm they are accurate.</label>{issues.accuracy && <small className="vf-error">Confirm accuracy before submitting.</small>}
    {file && photoConsent && <p>Photograph selected: {file.name}</p>}</>}
    {notice && <p role="status" className="vf-callout">{notice}</p>}{error && <ErrorState error={error}/>}
    <div className="vf-actions">{step>0 && <button type="button" disabled={busy} onClick={()=>{setStep(step-1);setError('');}}>Back</button>}<button type="submit" disabled={busy} className="vf-primary">{busy?'Saving…':atReview?'Confirm and save':'Continue'}</button></div>
    <section className="vf-drafts"><BookOpen size={18}/><div><strong>Field drafts</strong><p>Device drafts stay in this browser and are readable on this device. Use a trusted device. Server drafts require a village, ward and date.</p><button type="button" disabled={busy} onClick={localSave}>Save on this device</button>{(!record || record.status==='Draft') && <button type="button" disabled={busy} onClick={()=>submit('Draft')}>Save server draft</button>}{draft && <button type="button" onClick={clearDraft}>Discard device copy</button>}</div></section>
    </form></div></main>;
}
