import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { z } from 'zod';
import { analysisScope,summary,problemCharts,progressCharts,report } from '../services/analytics.js';
import { transaction,log,requireRoles } from '../utils/http.js';
export const reports=Router();
reports.get('/dashboard/summary',async(req,res)=>res.json(await summary(await analysisScope(req.user,req.query))));
reports.get('/dashboard/problems',async(req,res)=>res.json(await problemCharts(await analysisScope(req.user,req.query))));
reports.get('/dashboard/survey-progress',async(req,res)=>res.json(await progressCharts(await analysisScope(req.user,req.query),req.user)));
const canExport=requireRoles('admin','viewer');
function cell(v){
  let s=String(v??'');
  if(/^[\s]*[=+@-]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
reports.get('/reports/export',canExport,async(req,res)=>{
  const format=z.enum(['csv','pdf']).parse(req.query.format??'csv');
  const type=req.query.type??'households';
  const r=await report(req.user,req.query,type);
  await transaction(s=>log(s,req.user,'export',type,undefined,{format,sampleSize:r.sampleSize}));
  const metadata=[['Report',r.title],['Generated',r.generatedAt],['Survey dates',[r.from,r.to].map(x=>x||'None').join(' to ')],['Sample size',r.sampleSize],['Limitations',r.limitations]];
  const rows=[...metadata,[],['Review status','Count'],...r.byStatus.map(x=>[x.name,x.value]),[],['Group','Count'],...r.rows.map(x=>[x.name,x.value])];
  res.attachment('village360-'+type+'.'+format);
  if(format==='csv')return res.type('text/csv; charset=utf-8').send('\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n'));
  res.type('application/pdf');const pdf=new PDFDocument({margin:48});pdf.pipe(res);
  pdf.fillColor('#16553c').fontSize(24).text('VILLAGE 360°').moveDown(.5);
  for(const row of rows)pdf.fontSize(11).fillColor('#20392f').text(row.join('   |   ')).moveDown(.3);
  pdf.end();
});
reports.get('/reports/:type',canExport,async(req,res)=>res.json(await report(req.user,req.query,req.params.type)));
