import React,{useState} from 'react';
import {Link} from 'react-router-dom';
import { Map, MapPin, House, TriangleAlert, BadgeCheck, Clock, Building2, Sprout, Users, Landmark, GraduationCap, FileText } from 'lucide-react';
import {ResponsiveContainer,BarChart,Bar,LineChart,Line,YAxis,XAxis,CartesianGrid,Tooltip} from 'recharts';
import {useAuth} from '../context/Auth';
import {useResource,PageHeading,SurveyFilters,blankFilters,query,LoadingState,ErrorState,Empty} from './WorkspaceShared';

const metrics=[
  ['villages','Villages',Map],['wards','Wards',MapPin],['households','Households surveyed',House],
  ['problems','Village problems',TriangleAlert],['verifiedProblems','Verified problems',BadgeCheck],
  ['pendingVerification','Pending verification',Clock],['infrastructure','Infrastructure locations',Building2],
  ['farmers','Farmer interactions',Sprout],['shgs','Self-help groups',Users],['consultations','Panchayat consultations',Landmark],
  ['students','Student participation',GraduationCap]
];
const f = new Intl.NumberFormat();
function Chart({title,data,trend=false,color='#35865c'}) {
  const [expand,setExpand]=useState(false);
  const rows=data||[];
  return <article className="ws-chart"><h3>{title}</h3>{rows.length ? <>
    <div aria-hidden="true" style={{width:'100%',height:trend?235:Math.max(180,Math.min(440,rows.length*32+45))}}>
      <ResponsiveContainer width="100%" height="100%">
        {trend?<LineChart data={rows} margin={{left:0,right:14,top:10,bottom:5}}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dae5dc"/><XAxis dataKey="name" tick={{fontSize:12}} minTickGap={28}/><YAxis width={36} allowDecimals={false}/><Tooltip/><Line dataKey="value" name="Records" type="linear" stroke={color} strokeWidth={2.5}/></LineChart>
        :<BarChart data={rows.slice(0,12)} layout="vertical" margin={{left:0,right:14,top:5,bottom:2}}>
          <CartesianGrid horizontal={false} stroke="#e4ebe5"/><YAxis dataKey="name" type="category" interval={0} width={112} tick={{fontSize:12,fill:'#38563e'}} tickFormatter={t=>String(t).length>16?String(t).slice(0,15)+'…':t}/><XAxis type="number" allowDecimals={false} tick={{fontSize:12}}/><Tooltip/><Bar name="Records" dataKey="value" fill={color} radius={[0,4,4,0]} maxBarSize={20}/></BarChart>}
      </ResponsiveContainer>
    </div>
    {rows.length>12 && !trend && <p className="ws-muted">Chart shows the first 12 groups.</p>}
    <button type="button" aria-expanded={expand} onClick={()=>setExpand(!expand)}>{expand?'Hide values':'View all values'}</button>
    {expand && <div className="ws-table-wrap"><table><thead><tr><th scope="col">Group</th><th scope="col">Count</th></tr></thead><tbody>{rows.map(row=><tr key={row.name}><th scope="row">{row.name}</th><td>{f.format(row.value)}</td></tr>)}</tbody></table></div>}
  </>:<Empty>No observations in this selection.</Empty>}</article>
}
function Result({resource,onRetry,children}) {
  if(resource.loading)return <LoadingState/>;
  if(resource.error)return <ErrorState error={resource.error} onRetry={onRetry}/>;
  return children(resource.data);
}
export default function Dashboard(){
  const {user}=useAuth();
  const [filters,setFilters]=useState({...blankFilters});
  const [revision,setRevision]=useState(0);
  const params=query(filters), retry=()=>setRevision(x=>x+1);
  const summary=useResource('/dashboard/summary',params,revision);
  const problems=useResource('/dashboard/problems',params,revision);
  const progress=useResource('/dashboard/survey-progress',params,revision);
  return <main className="ws-page">
    <PageHeading eyebrow="Field research" title="Survey dashboard" action={user?.role!=='surveyor' && <Link className="ws-button" to="/reports"><FileText size={16}/>View reports</Link>}>{user?.role==='viewer'?'Approved findings across the pilot study.':'Collection progress, infrastructure concerns and household services.'}</PageHeading>
    <SurveyFilters value={filters} onChange={setFilters}/>
    <Result resource={summary} onRetry={retry}>{({counts,targets})=><>
      <h2>Survey coverage</h2><div className="ws-stats">{metrics.map(([key,label,Icon])=><article className="ws-metric" key={key}><div><Icon size={17}/>{label}</div><b>{f.format(counts[key])}</b></article>)}</div>
      <h2>Pilot targets</h2><section className="ws-panel">
        <div className="ws-targets">{metrics.filter(([key])=>targets[key]>0).map(([key,label])=><div className="ws-target" key={key}><div><span>{label}</span><strong>{counts[key]} / {targets[key]}</strong></div><progress aria-label={label} value={counts[key]} max={targets[key]}/></div>)}</div>
        {!Object.values(targets).some(x=>x>0) && <Empty>Set a pilot target for a village in Administration.</Empty>}
        <p className="ws-muted">Targets guide fieldwork. Survey coverage alone does not establish a representative sample.</p>
      </section></>}</Result>
    <h2>Public infrastructure problems</h2><Result resource={problems} onRetry={retry}>{d=><section className="ws-charts"><Chart title="Problems by category" data={d.byCategory}/><Chart title="Problems by severity" data={d.bySeverity} color="#b5782a"/><Chart title="Ward-wise problem distribution" data={d.byWard}/></section>}</Result>
    <h2>Household services and fieldwork</h2><Result resource={progress} onRetry={retry}>{d=><section className="ws-charts"><Chart title="Drinking-water availability" data={d.water} color="#3e7896"/><Chart title="Toilet availability" data={d.toilet}/><Chart title="Electricity availability" data={d.electricity}/><Chart title="Survey completion by student" data={d.byStudent}/><Chart title="Survey progress over time" data={d.overTime} trend/></section>}</Result>
  </main>;
}
