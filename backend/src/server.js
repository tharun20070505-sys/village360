import mongoose from 'mongoose';
import {connect} from './config/env.js';
import app from './app.js';
await connect();
const port=Number(process.env.PORT||5001);
const server=app.listen(port,()=>console.log(`Village 360 API listening on port ${port}`));
async function stop(){server.close(async()=>{await mongoose.disconnect();process.exit(0);});}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
