import {Router} from 'express';
import {createHash,timingSafeEqual} from 'node:crypto';
import mongoose from 'mongoose';
import {Village,records} from '../models/index.js';
import {id,fail} from '../utils/http.js';
export const gramagent=Router();
const indicators=[['waterAvailability','Unavailable','Households without water','Water supply'],['toiletAvailability','No','Households without toilets','Sanitation'],['electricityConnection','No','Households without electricity','Infrastructure'],['schoolAccess','Unavailable','Households without school access','Education'],['healthcareAccess','Unavailable','Households without healthcare access','Healthcare'],['internet','No','Households without internet','Digital literacy']];
// Dedicated, read-only server credential; never accepts end-user cookies.
gramagent.get('/gramagent/v1/snapshots/:village',async(req,res)=>{
 const expected=process.env.GRAMAGENT_READ_TOKEN;
 if(!expected||expected.length<32)fail(503,'GramAgent integration is not configured.');
 const supplied=(req.get('authorization')||'').replace(/^Bearer /,'');
 const hash=s=>createHash('sha256').update(s).digest();
 if(!timingSafeEqual(hash(supplied),hash(expected)))fail(401,'Invalid integration credential.');
 const villageId=id(req.params.village);
 const permitted=(process.env.GRAMAGENT_VILLAGE_IDS||'').split(',').filter(Boolean);
 if(!permitted.includes(villageId))fail(403,'Village is outside integration scope.');
 const village=await Village.findById(villageId).lean();if(!village)fail(404,'Village not found.');
 const filter={village:new mongoose.Types.ObjectId(villageId),status:'Verified','data.consent':true};
 const minimum=Math.max(5,Number(process.env.GRAMAGENT_MIN_SAMPLE)||5);
 const observations=[];
 for(const [field,adverse,indicator,sector] of indicators){
  const [row]=await records.households.aggregate([{$match:{...filter,[`data.${field}`]:{$exists:true,$nin:[null,'Unknown','Prefer not to say']}}},{$group:{_id:null,denominator:{$sum:1},value:{$sum:{$cond:[{$eq:[`$data.${field}`,adverse]},1,0]}},sourceDate:{$min:'$surveyDate'}}}]);
  // Suppress small denominators AND small non-zero cells, including complements.
  if(!row||row.denominator<minimum||(row.value>0&&row.value<minimum)||(row.denominator-row.value>0&&row.denominator-row.value<minimum))continue;
  observations.push({indicator,sector,value:row.value,denominator:row.denominator,unit:'count',adverse:true,source:`Village 360 verified household aggregate / ${village.publicId} / ${field}`,source_date:row.sourceDate.toISOString().slice(0,10),verified:true,latitude:null,longitude:null,public_location:false});
 }
 res.set('Cache-Control','no-store').json({schema_version:1,source_village_id:villageId,source_name:'Village 360° verified household aggregates',synthetic:false,observations,generated_at:new Date().toISOString(),limitations:'Consenting verified convenience sample only. Small cells suppressed. Source date is the oldest contributing survey.'});
});
