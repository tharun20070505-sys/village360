import mongoose from 'mongoose';
import { z } from 'zod';
import { records,statuses,Village,Ward,targetDefaults } from '../models/index.js';
import { id,date } from '../utils/http.js';
import { allowedVillage,villageScope } from '../routes/admin.js';
const oid=value=>new mongoose.Types.ObjectId(id(value));
export async function analysisScope(user,params){
  const filter=await villageScope(user);
  if(user.role==='surveyor')filter.createdBy=user._id;
  if(params.village){await allowedVillage(user,id(params.village));filter.village=oid(params.village);}
  if(params.ward)filter.ward=oid(params.ward);
  const allowed=user.role==='viewer'?['Verified','Resolved']:statuses.filter(s=>s!=='Draft');
  const selected=params.status?z.enum(statuses).parse(params.status):null;
  filter.status={$in:selected?allowed.filter(s=>s===selected):allowed};
  if(params.category)filter['data.category']=z.string().trim().max(120).parse(params.category);
  if(params.from||params.to){
    filter.surveyDate={};
    if(params.from)filter.surveyDate.$gte=new Date(date.parse(params.from));
    if(params.to)filter.surveyDate.$lt=new Date(+new Date(date.parse(params.to))+86400000);
  }
  const type=params.type&&params.type!=='all'?z.enum(Object.keys(records)).parse(params.type):null;
  return {filter,type};
}
const active=(scope,kind)=>!scope.type||scope.type===kind;
const count=(scope,kind,extra={})=>active(scope,kind)?records[kind].countDocuments({...scope.filter,...extra}):0;
export async function summary(scope){
  const {filter}=scope;
  const villageQuery=filter.village?{_id:filter.village}:{};
  const wardQuery={...(filter.village?{village:filter.village}:{}),...(filter.ward?{_id:filter.ward}:{})};
  if(filter.ward)villageQuery._id={$in:await Ward.distinct('village',wardQuery)};
  const [totals,wardCount,villages,verified,pending]=await Promise.all([
    Promise.all(Object.keys(records).map(async kind=>[kind,await count(scope,kind)])),
    Ward.countDocuments(wardQuery),Village.find(villageQuery,'targets').lean(),
    count(scope,'problems',{status:{$in:filter.status.$in.filter(s=>['Verified','Resolved'].includes(s))}}),
    count(scope,'problems',{status:{$in:filter.status.$in.filter(s=>['Submitted','Under Review'].includes(s))}})
  ]);
  const targets=Object.fromEntries(Object.keys(targetDefaults).map(key=>[key,villages.reduce((n,v)=>n+(v.targets?.[key]??targetDefaults[key]),0)]));
  return {counts:{...Object.fromEntries(totals),wards:wardCount,villages:villages.length,verifiedProblems:verified,pendingVerification:pending},targets};
}
async function group(scope,kind,by,lookup){
  if(!active(scope,kind))return [];
  const pipeline=[{$match:scope.filter},{$group:{_id:by,value:{$sum:1}}}];
  if(lookup){
    pipeline.push({$lookup:{from:lookup,localField:'_id',foreignField:'_id',as:'ref'}},{$set:{_id:{$arrayElemAt:['$ref.'+(lookup==='users'?'publicId':'name'),0]}}});
  }
  pipeline.push({$project:{_id:0,name:{$ifNull:['$_id','Unspecified']},value:1}},{$sort:{name:1}});
  return records[kind].aggregate(pipeline);
}
export async function problemCharts(scope){
  const [byCategory,bySeverity,byWard]=await Promise.all([group(scope,'problems','$data.category'),group(scope,'problems','$data.severity'),group(scope,'problems','$ward','wards')]);
  return {byCategory,bySeverity,byWard};
}
function combine(groups){
  const entries=new Map();
  for(const item of groups.flat())entries.set(item.name,(entries.get(item.name)||0)+item.value);
  return [...entries].map(([name,value])=>({name,value})).sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
export async function progressCharts(scope,user){
  const kinds=Object.keys(records).filter(k=>active(scope,k));
  const [water,toilet,electricity,byStudent,overTime]=await Promise.all([
    group(scope,'households','$data.waterAvailability'),group(scope,'households','$data.toiletAvailability'),group(scope,'households','$data.electricityConnection'),
    user.role==='viewer'?[]:Promise.all(kinds.map(k=>group(scope,k,'$createdBy','users'))),
    Promise.all(kinds.map(k=>group(scope,k,{$dateToString:{format:'%Y-%m-%d',date:'$surveyDate'}})))
  ]);
  return {water,toilet,electricity,byStudent:combine(byStudent),overTime:combine(overTime)};
}
const reportKinds=['households','problems','infrastructure','progress'];
export async function report(user,params,type){
  z.enum(reportKinds).parse(type);
  const scope=await analysisScope(user,{...params,type:type==='progress'?undefined:type});
  const lookup=params.group==='village'?['$village','villages']:params.group==='ward'?['$ward','wards']:null;
  const labels={households:'Household survey summary',problems:'Village problem reports',infrastructure:'Infrastructure observations',progress:'Survey completion report'};
  let rows;
  if(type==='progress'){
    rows=user.role==='viewer'?(await progressCharts(scope,user)).overTime:(await progressCharts(scope,user)).byStudent;
  }else if(lookup){rows=await group(scope,type,...lookup);}
  else{rows=await group(scope,type,type==='households'?'$ward':type==='problems'?'$data.category':'$data.facilityType',type==='households'?'wards':null);}
  const kinds=type==='progress'?Object.keys(records):[type];
  const range=await Promise.all(kinds.map(k=>records[k].aggregate([{$match:scope.filter},{$group:{_id:null,from:{$min:'$surveyDate'},to:{$max:'$surveyDate'}}}])));
  const sorted=range.flat().flatMap(r=>[r.from,r.to]).sort((a,b)=>a-b);
  const byStatus=combine(await Promise.all(kinds.map(k=>group(scope,k,'$status'))));
  return {title:labels[type],generatedAt:new Date().toISOString(),from:params.from||sorted[0]?.toISOString().slice(0,10)||null,to:params.to||sorted.at(-1)?.toISOString().slice(0,10)||null,sampleSize:rows.reduce((n,r)=>n+r.value,0),rows,byStatus,limitations:'Pilot fieldwork uses a convenience sample. Counts describe recorded observations only. Submitted and Under Review records are unverified. Verified and Resolved records have undergone administrative review.'};
}
