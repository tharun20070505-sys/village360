import { randomBytes, createHmac, createHash, timingSafeEqual } from 'node:crypto';
import { Session, User } from '../models/index.js';
import { secret, production, origin } from '../config/env.js';
import { fail } from '../utils/http.js';
export const cookieName = production?'__Host-v360':'v360';
const options={httpOnly:true,secure:production,sameSite:'lax',path:'/'};
const hash=value=>createHash('sha256').update(value).digest('hex');
const csrf=value=>createHmac('sha256',secret()).update('csrf:'+value).digest('hex');
export function browserOrigin(req,res,next){
  if (!['GET','HEAD','OPTIONS'].includes(req.method) && req.get('origin')!==origin) return res.status(403).json({error:'Untrusted request origin.'});
  next();
}
export async function signIn(res,user,previous){
  if(previous) await Session.deleteOne({_id:hash(previous)});
  const token=randomBytes(32).toString('hex'),maxAge=8*60*60*1000;
  await Session.create({_id:hash(token),user:user._id,expiresAt:new Date(Date.now()+maxAge)});
  res.cookie(cookieName,token,{...options,maxAge});
  return csrf(token);
}
export async function authenticate(req,res,next){
  const token=req.cookies[cookieName];
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(401,'Sign in to continue.');
  const session=await Session.findOne({_id:hash(token),expiresAt:{$gt:new Date()}}).lean();
  if(!session)fail(401,'Session expired. Sign in again.');
  req.user=await User.findOne({_id:session.user,active:true}).lean();
  if(!req.user)fail(401,'This account is inactive.');
  req.csrfToken=csrf(token);
  req.sessionId=session._id;
  if(!['GET','HEAD','OPTIONS'].includes(req.method)){
    const supplied=req.get('x-csrf-token')||'';
    if(!/^[a-f0-9]{64}$/.test(supplied)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(req.csrfToken)))fail(403,'Refresh your session before submitting.');
  }
  next();
}
export async function signOut(req,res){
  await Session.deleteOne({_id:req.sessionId});
  res.clearCookie(cookieName,options).sendStatus(204);
}
