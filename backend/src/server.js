import mongoose from 'mongoose';
import {connect} from './config/env.js';
import app from './app.js';
await connect();
const port=Number(process.env.PORT||5000);
const host=process.env.HOST||(process.env.NODE_ENV==='production'?'0.0.0.0':'127.0.0.1');
const server=app.listen(port,host,()=>console.log(`Village 360 API listening on http://${host}:${port}`));
async function stop(){server.close(async()=>{await mongoose.disconnect();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
