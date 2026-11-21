import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const { Schema } = mongoose;
const ref = (model, required = true) => ({ type: Schema.Types.ObjectId, ref: model, required, index: true });
const string = (maxlength = 120) => ({ type: String, trim: true, required: true, maxlength });
function schema(prefix, fields) {
  return new Schema({
    publicId: { type: String, default: () => prefix + '-' + randomUUID(), unique: true, immutable: true },
    schemaVersion: { type: Number, default: 1, immutable: true },
    createdBy: ref('User', false), ...fields
  }, { timestamps: true, strict: 'throw', minimize: false });
}
const model = (name, shape, collection) => mongoose.model(name, shape, collection);
export const User = model('User',schema('USR',{
  name: string(), email: { ...string(254), lowercase:true, unique:true },
  passwordHash:{ type:String,required:true,select:false },
  role:{ type:String,enum:['admin','surveyor','viewer'],required:true }, active:{type:Boolean,default:true}
}),'users');
export const targetDefaults = {households:0,infrastructure:30,farmers:15,shgs:5,consultations:3,students:25};
export const Village = model('Village',schema('VIL',{
  name:{...string(),unique:true},targets:Object.fromEntries(Object.entries(targetDefaults).map(([key,value])=>[key,{type:Number,default:value,min:0,max:1000000}]))
}),'villages');
const wardSchema = schema('WD',{name:string(),village:ref('Village')});
wardSchema.index({village:1,name:1},{unique:true});
export const Ward = model('Ward',wardSchema,'wards');
const assignmentSchema = schema('ASG',{user:ref('User'),village:ref('Village'),team:{type:String,maxlength:100,default:''}});
assignmentSchema.index({user:1,village:1},{unique:true});
export const Assignment = model('Assignment',assignmentSchema,'survey_assignments');
const householdSchema = schema('HH',{village:ref('Village'),ward:ref('Ward'),reference:string()});
householdSchema.index({village:1,reference:1},{unique:true});
export const Household = model('Household',householdSchema,'households');
export const statuses=['Draft','Submitted','Under Review','Verified','Duplicate','Resolved'];
const definitions={households:['HHS','household_surveys'],problems:['PRB','village_problems'],infrastructure:['INF','infrastructure_observations'],farmers:['FRM','farmer_surveys'],shgs:['SHG','shg_surveys'],consultations:['CON','panchayat_consultations'],students:['STU','student_participation']};
export const records = Object.fromEntries(Object.entries(definitions).map(([kind,[prefix,collection]])=>{
  const s = schema(prefix,{
    village:ref('Village'),ward:ref('Ward'),household:ref('Household',false),
    surveyDate:{type:Date,required:true,index:true},data:{type:Schema.Types.Mixed,required:true},
    status:{type:String,enum:statuses,required:true,index:true},key:{type:String,required:true,select:false},
    digest:{type:String,required:true,select:false},uniqueRef:{type:String,select:false},
    photo:{type:Buffer,select:false},hasPhoto:{type:Boolean,default:false}
  });
  s.index({createdBy:1,key:1},{unique:true});
  s.index({village:1,uniqueRef:1},{unique:true,partialFilterExpression:{uniqueRef:{$type:'string'}}});
  s.index({village:1,ward:1,status:1,surveyDate:-1});
  return [kind,model(prefix,s,collection)];
}));
export const Audit = model('Audit',schema('LOG',{
  action:string(),kind:string(),record:{type:Schema.Types.ObjectId,index:true},changes:Schema.Types.Mixed
}),'audit_logs');
const sessionSchema = new Schema({_id:String,user:ref('User'),expiresAt:{type:Date,expires:0,required:true}},{timestamps:true});
export const Session = model('LoginSession',sessionSchema,'sessions');
