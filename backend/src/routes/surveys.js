import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import sharp from 'sharp';
import { records,statuses } from '../models/index.js';
import { createRecord,editRecord,getRecord,recordQuery } from '../services/records.js';
import { fail,page,requireRoles,transaction,log,publicRecord } from '../utils/http.js';
export const surveyRoutes=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:2*1024*1024,files:1,fields:0,parts:2}}).single('photo');
for(const [kind,model] of Object.entries(records)){
  const path=kind==='problems'?'/problems':'/surveys/'+kind;
  const r=Router();
  surveyRoutes.use(path,requireRoles('admin','surveyor'),r);
  r.get('/',async(req,res)=>res.json(await page(model,await recordQuery(req.user,req.query),req.query)));
  r.post('/',async(req,res)=>{
    const result=await createRecord(kind,req.body,req.user,req.get('Idempotency-Key'));
    res.status(result.replayed?200:201).json(result.record);
  });
  r.get('/:id',async(req,res)=>res.json(publicRecord(await getRecord(kind,req.user,req.params.id))));
  r.patch('/:id',async(req,res)=>res.json(await editRecord(kind,req.body,req.user,req.params.id)));
  r.patch('/:id/status',requireRoles('admin'),async(req,res)=>{
    const {status,revision}=z.object({status:z.enum(statuses),revision:z.number().int().min(0).optional()}).strict().parse(req.body);
    const doc=await transaction(async session=>{
      const record=await getRecord(kind,req.user,req.params.id,session);
      if(revision!==undefined&&revision!==record.__v)fail(409,'Record changed. Refresh before reviewing.');
      const from=record.status;
      const transitions={Submitted:['Under Review','Verified','Duplicate'], 'Under Review':['Verified','Duplicate'], Verified:['Resolved','Under Review'],Duplicate:['Under Review'],Resolved:['Under Review']};
      if((kind!=='problems'&&['Duplicate','Resolved'].includes(status))||!transitions[from]?.includes(status))fail(422,'This status change is unavailable.');
      const updated=await model.findOneAndUpdate(
        {_id:record._id,__v:record.__v},
        {$set:{status},$inc:{__v:1}},
        {new:true,session,runValidators:false}
      );
      if(!updated)fail(409,'Record changed. Refresh before reviewing.');
      await log(session,req.user,'review',kind,record._id,{status:{before:from,after:status}});return publicRecord(updated);
    });res.json(doc);
  });
  if(!['problems','infrastructure'].includes(kind))continue;
  r.put('/:id/photo',upload,async(req,res)=>{
    if(!req.file)fail(422,'Select a photograph.');
    const doc=await getRecord(kind,req.user,req.params.id);
    if(!doc.data.photoConsent)fail(422,'Record photo consent first.');
    let bytes;
    try{
      const input=sharp(req.file.buffer,{limitInputPixels:20000000,failOn:'warning'});
      const meta=await input.metadata();
      if(!['jpeg','png','webp'].includes(meta.format))fail(422,'Unsupported image.');
      bytes=await input.rotate().resize(1400,1400,{fit:'inside',withoutEnlargement:true}).webp({quality:75}).toBuffer();
    }catch{fail(422,'Choose a valid JPEG, PNG or WebP photograph.');}
    await transaction(async session=>{
      const current=await getRecord(kind,req.user,req.params.id,session);
      if(!current.data.photoConsent)fail(422,'Photo consent is required.');
      if(req.user.role!=='admin'&&(current.hasPhoto||!['Draft','Submitted'].includes(current.status)))fail(403,'A reviewer must authorize this photo change.');
      current.photo=bytes;current.hasPhoto=true;current.increment();await current.save({session});
      await log(session,req.user,'photo',kind,current._id,{uploaded:true});
    });res.json({hasPhoto:true});
  });
  r.get('/:id/photo',async(req,res)=>{
    const doc=await model.findOne({...await recordQuery(req.user),_id:(await getRecord(kind,req.user,req.params.id))._id}).select('+photo');
    if(!doc?.photo||!doc.data.photoConsent)fail(404,'No photograph available.');
    res.type('image/webp').send(doc.photo);
  });
}
