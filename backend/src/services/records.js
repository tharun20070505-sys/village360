import { createHash } from 'node:crypto';
import { z } from 'zod';
import { schemas,draftSchemas } from '../../../shared/forms.js';
import { records,Household,Ward,statuses } from '../models/index.js';
import { allowedVillage,villageScope } from '../routes/admin.js';
import { date,objectId,fail,id,log,transaction,publicRecord } from '../utils/http.js';
export const envelope=z.object({
  village:objectId,ward:objectId,surveyDate:date,data:z.record(z.unknown()),
  status:z.enum(['Draft','Submitted']).optional(),revision:z.number().int().nonnegative().optional()
}).strict();
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
export const digest=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
export async function recordQuery(user,params={}){
  const scope=await villageScope(user);
  if(user.role==='surveyor')scope.createdBy=user._id;
  if(params.village){scope.village=id(params.village);await allowedVillage(user,scope.village);}
  if(params.ward)scope.ward=id(params.ward);
  if(params.status)scope.status=z.enum(statuses).parse(params.status);
  if(params.category)scope['data.category']=z.string().max(100).parse(params.category);
  if(params.from||params.to){
    scope.surveyDate={};
    if(params.from)scope.surveyDate.$gte=new Date(date.parse(params.from));
    if(params.to)scope.surveyDate.$lt=new Date(+new Date(date.parse(params.to))+86400000);
  }
  if(params.q){
    const needle=z.string().trim().max(100).parse(params.q);
    const match={$regex:needle.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),$options:'i'};
    scope.$or=['publicId','data.title','data.householdRef','data.studentId','data.groupRef','data.street'].map(key=>({[key]:match}));
  }
  return scope;
}
export async function getRecord(kind,user,key,session=null){
  const doc=await records[kind].findOne({...await recordQuery(user),_id:id(key)}).session(session);
  if(!doc)fail(404,'Record not found.');
  return doc;
}
async function materialize(kind,body,status,user,session){
  await allowedVillage(user,body.village);
  if(!await Ward.exists({_id:body.ward,village:body.village}).session(session))fail(422,'Choose a ward belonging to this village.');
  const data=(status==='Draft'?draftSchemas:schemas)[kind].parse(body.data);
  const out={village:body.village,ward:body.ward,surveyDate:new Date(body.surveyDate),data,status};
  if(status!=='Draft'){
    const key=({households:'householdRef',students:'studentId',shgs:'groupRef'})[kind];
    if(key&&data[key])out.uniqueRef=String(data[key]).trim().toUpperCase();
    if(kind==='households'){
      const reference=String(data.householdRef).trim().toUpperCase();
      const household=await Household.findOneAndUpdate({village:body.village,reference},{$setOnInsert:{ward:body.ward,createdBy:user._id}},{upsert:true,new:true,session,setDefaultsOnInsert:true});
      if(String(household.ward)!==body.ward)fail(409,'This household reference is already associated with another ward.');
      out.household=household._id;
    }
  }
  return out;
}
export async function createRecord(kind,body,user,key){
  z.string().min(8).max(128).regex(/^[\w.-]+$/).parse(key);
  const input=envelope.omit({revision:true}).parse(body),payloadHash=digest(input),model=records[kind];
  await allowedVillage(user,input.village);
  const replay=async(session=null)=>{
    const existing=await model.findOne({createdBy:user._id,key}).select('+digest').session(session);
    if(existing&&existing.digest!==payloadHash)fail(409,'This submission key was used with different answers.');
    return existing&&publicRecord(existing);
  };
  try{
    return await transaction(async session=>{
      const old=await replay(session);if(old)return {record:old,replayed:true};
      const fields=await materialize(kind,input,input.status||'Submitted',user,session);
      const [doc]=await model.create([{...fields,key,digest:payloadHash,createdBy:user._id}],{session});
      await log(session,user,'create',kind,doc._id,{status:doc.status});
      return {record:publicRecord(doc),replayed:false};
    });
  }catch(error){
    if(error.code===11000){const old=await replay();if(old)return {record:old,replayed:true};}
    throw error;
  }
}
export async function editRecord(kind,body,user,key){
  const patch=envelope.partial().parse(body);
  return transaction(async session=>{
    const doc=await getRecord(kind,user,key,session);
    if(user.role!=='admin'&&doc.status!=='Draft')fail(403,'Only a draft can be edited.');
    if(patch.revision!==undefined&&doc.__v!==patch.revision)fail(409,'Record changed. Reload before editing.');
    if(patch.status&&doc.status!=='Draft'&&patch.status!==doc.status)fail(422,'Use the verification workflow to change status.');
    const input={village:patch.village||String(doc.village),ward:patch.ward||String(doc.ward),surveyDate:patch.surveyDate||doc.surveyDate.toISOString().slice(0,10),data:patch.data??doc.data};
    const fields=await materialize(kind,input,patch.status||doc.status,user,session);
    const changes={};
    for(const [field,value] of Object.entries(fields)){
      const before=doc.toObject()[field];
      if(field!=='uniqueRef'&&digest(before??null)!==digest(value))changes[field]={before,after:value};
      doc.set(field,value);
    }
    if(doc.hasPhoto&&!fields.data.photoConsent){doc.set('photo',undefined);doc.hasPhoto=false;}
    doc.increment();await doc.save({session});
    await log(session,user,'correct',kind,doc._id,changes);return publicRecord(doc);
  });
}
