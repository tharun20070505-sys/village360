// Dry-run unless explicitly invoked with --apply. Run from a restricted maintenance host.
import mongoose from 'mongoose';
import { z } from 'zod';
import { connect } from '../src/config/env.js';
import { records,Audit,Household } from '../src/models/index.js';
import { log,transaction } from '../src/utils/http.js';
const days=z.coerce.number().int().min(1).max(36500).parse(process.env.RETENTION_DAYS);
const cutoff=new Date(Date.now()-days*86400000);
const apply=process.argv.includes('--apply');
try{
  await connect();
  for(const [kind,model] of Object.entries(records)){
    const query={updatedAt:{$lt:cutoff}};
    console.log(kind,await model.countDocuments(query),'eligible records',apply?'(apply)':'(dry run)');
    if(!apply)continue;
    for await(const item of model.find(query).select('_id').lean().cursor()){
      await transaction(async session=>{
        const record=await model.findOneAndDelete({_id:item._id,...query},{session});
        if(!record)return;
        await Audit.deleteMany({record:record._id},{session});
        if(record.household&&!await records.households.exists({household:record.household}).session(session))await Household.deleteOne({_id:record.household},{session});
        await log(session,null,'retention-delete',kind,record._id,{cutoff});
      });
    }
  }
  if(apply)await Audit.deleteMany({updatedAt:{$lt:cutoff}});
}finally{await mongoose.disconnect();}
