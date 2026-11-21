import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import argon2 from 'argon2';
import { z } from 'zod';
import { User } from '../models/index.js';
import { authenticate,signIn,signOut,cookieName } from '../middleware/session.js';
import { fail,text,publicRecord } from '../utils/http.js';
export const auth=Router();
const dummyHash=argon2.hash('invalid-'+crypto.randomUUID(),{type:argon2.argon2id});
auth.post('/login',rateLimit({windowMs:15*60*1000,limit:20,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many sign-in attempts. Try again later.'}}),async(req,res)=>{
  const {identifier,password}=z.object({identifier:text(254),password:z.string().min(1).max(256)}).strict().parse(req.body);
  const user=await User.findOne({$or:[{email:identifier.toLowerCase()},{publicId:identifier}]}).select('+passwordHash');
  const valid=await argon2.verify(user?.passwordHash??await dummyHash,password);
  if(!valid||!user?.active)fail(401,'Invalid credentials.');
  const csrfToken=await signIn(res,user,req.cookies[cookieName]);
  res.json({user:publicRecord(user),csrfToken});
});
auth.get('/me',authenticate,(req,res)=>res.json({user:req.user,csrfToken:req.csrfToken}));
auth.post('/logout',authenticate,signOut);
