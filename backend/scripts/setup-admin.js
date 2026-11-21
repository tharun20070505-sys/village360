import argon2 from 'argon2';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connect } from '../src/config/env.js';
import { User } from '../src/models/index.js';
import { log,transaction } from '../src/utils/http.js';
const email=z.string().email().parse(process.env.ADMIN_EMAIL).toLowerCase();
const password=z.string().min(12).max(256).parse(process.env.ADMIN_INITIAL_PASSWORD);
try{
  await connect();
  const passwordHash=await argon2.hash(password,{type:argon2.argon2id});
  await transaction(async session=>{
    if(await User.exists({role:'admin'}).session(session))throw new Error('Administrator already initialized.');
    const [user]=await User.create([{name:'Project administrator',email,passwordHash,role:'admin',publicId:'ADMIN-INITIAL'}],{session});
    user.createdBy=user._id;await user.save({session});
    await log(session,user,'bootstrap','users',user._id);
  });
  console.log('Administrator created. Remove the bootstrap password from the environment.');
}finally{await mongoose.disconnect();}
