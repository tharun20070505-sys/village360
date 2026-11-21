import mongoose from 'mongoose';
import { z } from 'zod';
import { Audit } from '../models/index.js';
export function fail(status,message){throw Object.assign(new Error(message),{status});}
export const objectId=z.string().regex(/^[a-f\d]{24}$/i,'Invalid identifier');
export const id=value=>objectId.parse(value);
export const text=(max=120)=>z.string().trim().min(1).max(max);
export const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v);return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;},'Invalid calendar date');
export async function page(model,query,params,select){
  const number=z.coerce.number().int().min(1);
  const p=number.max(100000).parse(params.page??1),limit=number.max(200).parse(params.limit??30);
  const [items,total]=await Promise.all([model.find(query).select(select||'').sort({createdAt:-1,_id:-1}).skip((p-1)*limit).limit(limit).lean(),model.countDocuments(query)]);
  return {items,total,page:p,limit};
}
export const transaction=fn=>mongoose.connection.transaction(fn);
export async function log(session,user,action,kind,record,changes){
  await Audit.create([{createdBy:user?._id,action,kind,record,changes}],{session});
}
export function requireRoles(...roles){return (req,res,next)=>roles.includes(req.user.role)?next():next(Object.assign(new Error('This role cannot perform that action.'),{status:403}));}
export function publicRecord(doc){const obj=doc.toObject?doc.toObject():{...doc};for(const key of ['key','digest','uniqueRef','photo','passwordHash'])delete obj[key];return obj;}
