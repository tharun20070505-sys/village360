import { Router } from 'express';
import { z } from 'zod';
import argon2 from 'argon2';
import { Assignment,Audit,User,Village,Ward,Session,targetDefaults } from '../models/index.js';
import { fail,id,objectId,text,page,log,transaction,requireRoles,publicRecord } from '../utils/http.js';
export const adminRoutes=Router();
const admin=requireRoles('admin');
export async function villageScope(user){
  if(user.role!=='surveyor')return {};
  return {village:{$in:await Assignment.distinct('village',{user:user._id})}};
}
export async function allowedVillage(user,village){
  if(user.role==='surveyor'&&!await Assignment.exists({user:user._id,village}))fail(403,'This village is outside your assignments.');
}
const targets=z.object(Object.fromEntries(Object.keys(targetDefaults).map(key=>[key,z.number().int().min(0).max(1000000).optional()]))).strict();
const villageFields=z.object({name:text(),targets:targets.optional()}).strict();
const wardFields=z.object({name:text(),village:objectId}).strict();
const roles=z.enum(['admin','viewer','surveyor']);
const userFields=z.object({name:text(),email:z.string().trim().email().max(254),role:roles,password:z.string().min(12).max(256)}).strict();
const userPatchFields=z.object({active:z.boolean().optional(),name:text().optional(),role:roles.optional(),password:z.string().min(12).max(256).optional()}).strict();
const assignmentFields=z.object({user:objectId,village:objectId,team:text(100).optional()}).strict();
async function exists(model,key){if(!await model.exists({_id:key}))fail(404,'Referenced item was not found.');}
async function add(model,data,req,kind){
  return transaction(async session=>{
    const [saved]=await model.create([{...data,createdBy:req.user._id}],{session});
    await log(session,req.user,'create',kind,saved._id);
    return publicRecord(saved);
  });
}
adminRoutes.get('/villages',async(req,res)=>{
  const scope=await villageScope(req.user);
  res.json(await page(Village,scope.village?{_id:scope.village}:{},req.query));
});
adminRoutes.get('/villages/:id',async(req,res)=>{
  const key=id(req.params.id);await allowedVillage(req.user,key);
  const v=await Village.findById(key);if(!v)fail(404,'Village not found.');res.json(v);
});
adminRoutes.post('/villages',admin,async(req,res)=>res.status(201).json(await add(Village,villageFields.parse(req.body),req,'villages')));
adminRoutes.get('/wards',async(req,res)=>{
  const q=await villageScope(req.user);
  if(req.query.village){q.village=id(req.query.village);await allowedVillage(req.user,q.village);}
  res.json(await page(Ward,q,req.query));
});
adminRoutes.post('/wards',admin,async(req,res)=>{
  const body=wardFields.parse(req.body);await exists(Village,body.village);
  res.status(201).json(await add(Ward,body,req,'wards'));
});
adminRoutes.get('/users',admin,async(req,res)=>res.json(await page(User,{},req.query)));
adminRoutes.post('/users',admin,async(req,res)=>{
  const {password,...body}=userFields.parse(req.body);
  body.passwordHash=await argon2.hash(password,{type:argon2.argon2id});
  res.status(201).json(await add(User,body,req,'users'));
});
for (const [path,model,validation] of [
  ['villages',Village,villageFields.partial()],['wards',Ward,z.object({name:text()}).strict()],['users',User,userPatchFields]
]){
  adminRoutes.patch('/'+path+'/:id',admin,async(req,res)=>{
    const body=validation.parse(req.body);
    if(!Object.keys(body).length)fail(422,'Choose a field to update.');
    const saved=await transaction(async session=>{
      const doc=await model.findById(id(req.params.id)).session(session);
      if(!doc)fail(404,'Item not found.');
      if(path==='users'&&doc._id.toString()===req.user._id.toString()&&body.active===false)fail(403,'You cannot deactivate your own administrator account.');
      const changes={};
      const updateData={};
      for(const [key,value] of Object.entries(body)){
        if(key==='password'){
          updateData.passwordHash=await argon2.hash(value,{type:argon2.argon2id});
          changes.password={before:'[redacted]',after:'[updated]'};
        } else if(key==='targets'){
          changes.targets={before:doc.toObject().targets,after:value};
          for(const [target,num] of Object.entries(value)) updateData['targets.'+target]=num;
        } else {
          changes[key]={before:doc.toObject()[key],after:value};
          updateData[key]=value;
        }
      }
      const updated=await model.findOneAndUpdate(
        { _id: doc._id },
        { $set: updateData },
        { new: true, session, runValidators: false }
      );
      if(path==='users'&&body.active===false)await Session.deleteMany({user:doc._id},{session});
      await log(session,req.user,'update',path,doc._id,changes);return publicRecord(updated);
    });res.json(saved);
  });
}
adminRoutes.get('/assignments',async(req,res)=>res.json(await page(Assignment,req.user.role==='surveyor'?{user:req.user._id}:req.user.role==='viewer'?{_id:null}:{},req.query)));
adminRoutes.post('/assignments',admin,async(req,res)=>{
  const body=assignmentFields.parse(req.body);await exists(Village,body.village);
  if(!await User.exists({_id:body.user,active:true,role:'surveyor'}))fail(422,'Choose an active surveyor.');
  res.status(201).json(await add(Assignment,body,req,'assignments'));
});
adminRoutes.delete('/assignments/:id',admin,async(req,res)=>{
  await transaction(async session=>{
    const doc=await Assignment.findByIdAndDelete(id(req.params.id),{session});
    if(!doc)fail(404,'Assignment not found.');
    await log(session,req.user,'unassign','assignments',doc._id,{user:doc.user,village:doc.village});
  });res.sendStatus(204);
});
adminRoutes.get('/audit',admin,async(req,res)=>res.json(await page(Audit,req.query.record?{record:id(req.query.record)}:{},req.query)));
