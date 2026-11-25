import asyncio
import csv
import io
import json
import logging
import time
from collections import defaultdict,deque
from contextlib import asynccontextmanager
from datetime import date
from urllib.parse import urlparse
from fastapi import FastAPI,Depends,HTTPException,UploadFile,File,Form,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response,StreamingResponse
from pydantic import Field,ValidationError
from .config import settings
from .store import store,audit,now
from .auth import current_user,require,scoped,visible,passwords,token,public_user,bootstrap,EDITORS,APPROVERS
from .models import Strict,SnapshotInput,RunInput,Decision,CostInput,Scenario,ImpactInput,PriorityInput,ROLES
from .imports import parse_file,demo_observations,TEMPLATE
from .intelligence import assess,digest,scenario,retrieve,model,SYSTEM
from .reports import report_bytes

@asynccontextmanager
async def lifespan(app):
    bootstrap();yield

app=FastAPI(title='GramAgent AI',version='1.0.0',lifespan=lifespan,description='Evidence-based advisory planning layer for Village 360°. All interventions require human review.')
app.add_middleware(CORSMiddleware,allow_origins=[settings.frontend_origin],allow_methods=['GET','POST','PATCH','DELETE'],allow_headers=['Authorization','Content-Type','Last-Event-ID'])
limits=defaultdict(deque)
@app.middleware('http')
async def limits_and_headers(request,call_next):
    key=(request.client.host if request.client else 'unknown', 'login' if request.url.path.endswith('/login') else 'api')
    q=limits[key];stamp=time.monotonic()
    while q and q[0]<stamp-60:q.popleft()
    if len(q)>=(10 if key[1]=='login' else 240):return Response('Rate limit exceeded',429,headers={'Retry-After':'60'})
    try:length=int(request.headers.get('content-length','0') or 0)
    except ValueError:return Response('Invalid content length',400)
    if length>6_000_000:return Response('Request too large',413)
    q.append(stamp)
    response=await call_next(request)
    response.headers.update({'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer'})
    return response

class Login(Strict):
    email:str=Field(max_length=254)
    password:str=Field(max_length=256)
class VillageInput(Strict):
    name:str=Field(min_length=2,max_length=120)
class UserInput(Strict):
    name:str=Field(min_length=2,max_length=120)
    email:str=Field(min_length=3,max_length=254)
    password:str=Field(min_length=16,max_length=256)
    role:str
    village_ids:list[str]=Field(default_factory=list)
class UserPatch(Strict):
    active:bool
class SyncInput(Strict):
    village_id:str
    source_village_id:str=Field(pattern='^[a-fA-F0-9]{24}$')
    adapter:str='rest'
class Question(Strict):
    village_id:str
    question:str=Field(min_length=5,max_length=2000)
class KnowledgeInput(Strict):
    title:str=Field(min_length=3,max_length=200)
    text:str=Field(min_length=30,max_length=30000)
    official_url:str=Field(max_length=1000)
    verified_date:date
    reviewed:bool=False
    eligibility:str=Field(min_length=5,max_length=3000)
    financial_assistance:str=Field(min_length=3,max_length=3000)
    documents:str=Field(min_length=3,max_length=3000)
    procedure:str=Field(min_length=3,max_length=3000)
    department:str=Field(min_length=3,max_length=500)

def internal(user):
    if user['role']=='public_viewer':raise HTTPException(403,'Only approved project summaries are available to public viewers')

def save_snapshot(body,user):
    require(user,EDITORS);scoped('villages',body['village_id'],user)
    fingerprint=digest(body)
    existing=store.all('snapshots',organisation_id=user['organisation_id'],checksum=fingerprint)
    if existing:return existing[0]
    result=store.put('snapshots',{**body,'organisation_id':user['organisation_id'],'checksum':fingerprint,'quality':assess(body['observations']),'created_by':user['id']})
    audit(user,'snapshot_imported',result['id'],checksum=fingerprint)
    return result

@app.get('/api/v1/health')
def health():return {'status':'ok','storage':'mongodb' if store.client else 'sqlite','ai_configured':settings.model_provider!='none' and bool(settings.model_name),'mode':settings.environment}
@app.post('/api/v1/auth/login')
def login(body:Login):
    users=store.all('users',email=body.email.strip().lower())
    user=users[0] if users else None
    # Constant-cost hash verification also for unknown accounts.
    hashed=user['password_hash'] if user else DUMMY_HASH
    try:valid=passwords.verify(body.password,hashed)
    except Exception:valid=False
    if not user or not valid or not user.get('active'):raise HTTPException(401,'Invalid email or password')
    audit(user,'login',user['id'])
    return {'access_token':token(user),'user':public_user(user)}
DUMMY_HASH=passwords.hash('invalid-account-placeholder-password')
@app.get('/api/v1/auth/me')
def me(user=Depends(current_user)):return public_user(user)
@app.get('/api/v1/villages')
def villages(user=Depends(current_user)):return [d for d in store.all('villages') if visible(d,user)]
@app.post('/api/v1/villages',status_code=201)
def create_village(body:VillageInput,user=Depends(current_user)):
    require(user,{'super_admin'})
    result=store.put('villages',{**body.model_dump(),'organisation_id':user['organisation_id']})
    audit(user,'village_created',result['id']);return result
@app.post('/api/v1/demo')
def demo(user=Depends(current_user)):
    require(user,{'super_admin'})
    found=store.all('villages',organisation_id=user['organisation_id'],demo=True)
    village=found[0] if found else store.put('villages',{'name':'Athipalayam · synthetic demonstration','organisation_id':user['organisation_id'],'demo':True})
    return save_snapshot({'village_id':village['id'],'source_name':'Synthetic fixture','synthetic':True,'observations':demo_observations()},user)
@app.get('/api/v1/snapshots')
def snapshots(village_id:str,user=Depends(current_user)):
    internal(user);scoped('villages',village_id,user)
    return store.all('snapshots',organisation_id=user['organisation_id'],village_id=village_id)
@app.post('/api/v1/snapshots',status_code=201)
def add_snapshot(body:SnapshotInput,user=Depends(current_user)):return save_snapshot(body.model_dump(mode='json'),user)
@app.get('/api/v1/import-template')
def template(user=Depends(current_user)):
    require(user,EDITORS)
    buf=io.StringIO();csv.writer(buf).writerow(TEMPLATE)
    return Response(buf.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename=aggregate-template.csv'})
@app.post('/api/v1/imports')
async def upload(village_id:str=Form(...),synthetic:bool=Form(False),file:UploadFile=File(...),user=Depends(current_user)):
    require(user,EDITORS);scoped('villages',village_id,user)
    content=await file.read(5_000_001)
    if len(content)>5_000_000:raise HTTPException(413,'File exceeds 5 MB')
    try:result=parse_file(file.filename or '',content,village_id,synthetic,file.filename or 'Upload')
    except (ValueError,ValidationError,KeyError,TypeError) as exc:raise HTTPException(422,str(exc)[:1000])
    if result.get('review_required'):
        staged=store.put('import_reviews',{**result,'organisation_id':user['organisation_id'],'village_id':village_id,'source_name':file.filename,'checksum':digest(content.hex())})
        audit(user,'pdf_staged',staged['id']);return staged
    return save_snapshot(result,user)
@app.post('/api/v1/sync')
def sync(body:SyncInput,user=Depends(current_user)):
    require(user,EDITORS);scoped('villages',body.village_id,user)
    job=store.put('sync_history',{'organisation_id':user['organisation_id'],'village_id':body.village_id,'adapter':body.adapter,'status':'running'})
    try:
        if body.adapter=='rest':
            if not settings.village360_url or not settings.village360_token:raise ValueError('Village 360 REST integration is not configured')
            import httpx
            response=httpx.get(settings.village360_url.rstrip('/')+'/api/gramagent/v1/snapshots/'+body.source_village_id,headers={'Authorization':'Bearer '+settings.village360_token},timeout=30,follow_redirects=False)
            response.raise_for_status();payload=response.json()
        elif body.adapter=='readonly_db':
            from .readonly_adapter import snapshot_from_database
            payload=snapshot_from_database(body.source_village_id)
        else:raise ValueError('Unknown adapter')
        parsed=SnapshotInput(village_id=body.village_id,source_name=payload['source_name'],synthetic=payload['synthetic'],observations=payload['observations'])
        result=save_snapshot(parsed.model_dump(mode='json'),user)
        store.put('sync_history',{**job,'status':'completed','snapshot_id':result['id']});return result
    except Exception as exc:
        store.put('sync_history',{**job,'status':'failed','error':type(exc).__name__})
        raise HTTPException(422,'Sync failed: '+str(exc)[:300])
@app.get('/api/v1/sync-history')
def sync_history(village_id:str,user=Depends(current_user)):
    internal(user);scoped('villages',village_id,user)
    return store.all('sync_history',organisation_id=user['organisation_id'],village_id=village_id)
@app.post('/api/v1/runs',status_code=202)
def start_run(body:RunInput,user=Depends(current_user)):
    require(user,EDITORS);snap=scoped('snapshots',body.snapshot_id,user)
    if body.mode=='ai' and (settings.model_provider=='none' or not settings.model_name):raise HTTPException(409,'AI provider is not configured. Analytical mode remains available.')
    if len(store.all('runs',organisation_id=user['organisation_id'],status='queued'))>=10:raise HTTPException(429,'Queue is full')
    config=body.model_dump();config['priority_inputs']=store.all('priority_inputs',organisation_id=user['organisation_id'],snapshot_id=snap['id']);config['costs']=store.all('costs',organisation_id=user['organisation_id'],snapshot_id=snap['id'])
    run=store.put('runs',{'organisation_id':user['organisation_id'],'village_id':snap['village_id'],'snapshot_id':snap['id'],'config':config,'status':'queued','created_by':user['id']})
    audit(user,'run_queued',run['id']);return run
@app.get('/api/v1/runs')
def runs(village_id:str,user=Depends(current_user)):
    internal(user);scoped('villages',village_id,user)
    return [{k:v for k,v in r.items() if k!='output'} for r in store.all('runs',organisation_id=user['organisation_id'],village_id=village_id)]
@app.get('/api/v1/runs/{run_id}')
def get_run(run_id:str,user=Depends(current_user)):
    internal(user);return scoped('runs',run_id,user)
@app.post('/api/v1/runs/{run_id}/retry',status_code=202)
def retry(run_id:str,user=Depends(current_user)):
    require(user,EDITORS);scoped('runs',run_id,user)
    run=store.claim('runs',run_id,'failed',{'status':'queued','error':None})
    if not run:raise HTTPException(409,'Only failed runs can be retried')
    audit(user,'run_retried',run_id);return run
@app.post('/api/v1/runs/{run_id}/cancel')
def cancel(run_id:str,user=Depends(current_user)):
    require(user,EDITORS);scoped('runs',run_id,user)
    run=store.claim('runs',run_id,'queued',{'status':'cancelled'})
    if not run:raise HTTPException(409,'Only queued runs can be cancelled')
    audit(user,'run_cancelled',run_id);return run
@app.get('/api/v1/runs/{run_id}/events')
def events(run_id:str,user=Depends(current_user)):
    internal(user);scoped('runs',run_id,user)
    return sorted(store.all('events',run_id=run_id),key=lambda e:e['created_at'])
@app.get('/api/v1/runs/{run_id}/stream')
async def stream(run_id:str,request:Request,user=Depends(current_user)):
    internal(user);scoped('runs',run_id,user)
    async def generate():
        seen=set();last=request.headers.get('last-event-id');started=last is None
        for _ in range(300):
            if await request.is_disconnected():break
            for event in sorted(store.all('events',run_id=run_id),key=lambda e:e['created_at']):
                if not started:
                    if event['id']==last:started=True
                    seen.add(event['id']);continue
                if event['id'] not in seen:
                    seen.add(event['id']);yield f"id: {event['id']}\ndata: {json.dumps(event)}\n\n"
            yield ': heartbeat\n\n';await asyncio.sleep(1)
    return StreamingResponse(generate(),media_type='text/event-stream')
@app.post('/api/v1/runs/{run_id}/decision',status_code=202)
def decide(run_id:str,body:Decision,user=Depends(current_user)):
    require(user,APPROVERS);run=scoped('runs',run_id,user)
    plan=run.get('output',{}).get('plan',{})
    if body.plan_hash!=plan.get('hash'):raise HTTPException(409,'Plan changed; review the current version')
    if run.get('output',{}).get('issues'):raise HTTPException(409,'Verification issues must be resolved')
    decision={**body.model_dump(),'reviewer':user['id'],'decided_at':now()}
    claimed=store.claim('runs',run_id,'awaiting_approval',{'status':'queued','resume_decision':decision})
    if not claimed:raise HTTPException(409,'This plan is not awaiting approval')
    store.put('approvals',{'id':run_id,'organisation_id':user['organisation_id'],'village_id':run['village_id'],**decision})
    audit(user,'plan_'+body.decision,run_id,plan_hash=body.plan_hash,reason=body.reason)
    return claimed
@app.get('/api/v1/costs')
def costs(snapshot_id:str,user=Depends(current_user)):
    internal(user);scoped('snapshots',snapshot_id,user)
    return store.all('costs',organisation_id=user['organisation_id'],snapshot_id=snapshot_id)
@app.post('/api/v1/snapshots/{snapshot_id}/costs',status_code=201)
def add_cost(snapshot_id:str,body:CostInput,user=Depends(current_user)):
    require(user,EDITORS);snap=scoped('snapshots',snapshot_id,user)
    from .intelligence import diagnose
    if body.finding_id not in {f['id'] for f in diagnose(snap['observations'])}:raise HTTPException(422,'Choose a finding in this snapshot')
    result=store.put('costs',{**body.model_dump(),'snapshot_id':snapshot_id,'village_id':snap['village_id'],'organisation_id':user['organisation_id']})
    audit(user,'cost_added',result['id']);return result
@app.post('/api/v1/scenarios')
def simulate(body:Scenario,user=Depends(current_user)):
    internal(user);return scenario(body)
@app.get('/api/v1/projects')
def projects(user=Depends(current_user)):
    return [d for d in store.all('projects') if visible(d,user)]
@app.post('/api/v1/projects/{project_id}/observations',status_code=201)
def impact(project_id:str,body:ImpactInput,user=Depends(current_user)):
    require(user,EDITORS);project=scoped('projects',project_id,user)
    if project['status']!='approved':raise HTTPException(409,'Project is not approved')
    difference=body.target-body.baseline
    progress=round(100*(body.current-body.baseline)/difference,2) if difference else None
    result=store.put('impact',{'project_id':project_id,'village_id':project['village_id'],'organisation_id':user['organisation_id'],**body.model_dump(mode='json'),'progress_percent':progress,'method':'(current − baseline) / (target − baseline) × 100; not proof of causality','review_note':'Review corrective action' if progress is not None and progress<0 else 'Compare against project timeline'})
    audit(user,'impact_observation_added',result['id']);return result
@app.get('/api/v1/projects/{project_id}/observations')
def get_impact(project_id:str,user=Depends(current_user)):
    internal(user);scoped('projects',project_id,user);return store.all('impact',project_id=project_id)
@app.get('/api/v1/knowledge')
def knowledge(user=Depends(current_user)):
    internal(user);return [{k:v for k,v in d.items() if k!='embedding'} for d in store.all('knowledge',organisation_id=user['organisation_id'])]
@app.post('/api/v1/knowledge',status_code=201)
def add_knowledge(body:KnowledgeInput,user=Depends(current_user)):
    require(user,{'super_admin','panchayat_officer'})
    parsed=urlparse(body.official_url);host=parsed.hostname or ''
    if parsed.scheme!='https' or not (host.endswith('.gov.in') or host.endswith('.nic.in')):raise HTTPException(422,'Use an official HTTPS gov.in or nic.in source URL')
    if body.verified_date>date.today():raise HTTPException(422,'Verification date cannot be in the future')
    doc={**body.model_dump(mode='json'),'organisation_id':user['organisation_id'],'reviewed_by':user['id'],'checksum':digest(body.text),'retrieval_method':'TF-IDF'}
    if settings.vector_index and settings.embedding_model:
        from langchain_openai import OpenAIEmbeddings
        doc['embedding']=OpenAIEmbeddings(model=settings.embedding_model).embed_query(body.title+' '+body.text);doc['retrieval_method']='Atlas Vector Search'
    result=store.put('knowledge',doc);audit(user,'knowledge_added',result['id'])
    return {k:v for k,v in result.items() if k!='embedding'}
@app.post('/api/v1/assistant')
def assistant(body:Question,user=Depends(current_user)):
    internal(user);scoped('villages',body.village_id,user)
    if settings.model_provider=='none':raise HTTPException(409,'Configure an AI provider to use the assistant')
    from langchain_core.tools import tool
    @tool
    def search_evidence(query:str)->str:
        """Search reviewed, current official scheme documents within this organisation."""
        return json.dumps([{k:v for k,v in d.items() if k!='embedding'} for d in retrieve(query,user['organisation_id'])])
    @tool
    def village_baseline()->str:
        """Read the latest authorised aggregate baseline; contains no household records."""
        snapshots=store.all('snapshots',organisation_id=user['organisation_id'],village_id=body.village_id)
        return json.dumps(snapshots[0] if snapshots else {'status':'no_data'})
    tools={t.name:t for t in [search_evidence,village_baseline]}
    llm=model().bind_tools(list(tools.values()))
    messages=[('system',SYSTEM+' Use tools to ground factual answers; cite sources. Do not reveal secrets or change data.'),('human',body.question)]
    calls=[]
    for _ in range(4):
        response=llm.invoke(messages);messages.append(response)
        if not response.tool_calls:
            audit(user,'assistant_answer',body.village_id,tools=calls)
            return {'answer':response.content,'tools':calls,'advisory':True}
        for call in response.tool_calls[:4]:
            if call['name'] not in tools:raise HTTPException(422,'Unsupported tool request')
            messages.append(tools[call['name']].invoke(call));calls.append(call['name'])
    raise HTTPException(422,'Tool limit reached; narrow the question')
@app.get('/api/v1/runs/{run_id}/report')
def export(run_id:str,format:str='pdf',kind:str='plan',user=Depends(current_user)):
    internal(user);run=scoped('runs',run_id,user)
    if format not in ('csv','xlsx','pdf'):raise HTTPException(422,'Use csv, xlsx or pdf')
    if kind not in ('baseline','gaps','priorities','schemes','students','plan','monthly','impact'):raise HTTPException(422,'Unknown report type')
    measurements=store.all('impact',project_id=run_id)
    content,mime=report_bytes(run,format,kind,measurements);audit(user,'report_exported',run_id,format=format)
    return Response(content,media_type=mime,headers={'Content-Disposition':f'attachment; filename=gramagent-{run_id}.{format}'})
@app.get('/api/v1/users')
def users(user=Depends(current_user)):
    require(user,{'super_admin'});return [public_user(d) for d in store.all('users',organisation_id=user['organisation_id'])]
@app.post('/api/v1/users',status_code=201)
def add_user(body:UserInput,user=Depends(current_user)):
    require(user,{'super_admin'})
    if body.role not in ROLES:raise HTTPException(422,'Unknown role')
    for village in body.village_ids:scoped('villages',village,user)
    email=body.email.strip().lower()
    if '@' not in email:raise HTTPException(422,'Enter an email address')
    if store.all('users',email=email):raise HTTPException(409,'Email already exists')
    result=store.put('users',{'id':digest(email),'email':email,'name':body.name,'role':body.role,'village_ids':body.village_ids,'password_hash':passwords.hash(body.password),'organisation_id':user['organisation_id'],'active':True})
    audit(user,'user_created',result['id']);return public_user(result)
@app.patch('/api/v1/users/{user_id}')
def update_user(user_id:str,body:UserPatch,user=Depends(current_user)):
    require(user,{'super_admin'});target=scoped('users',user_id,user)
    if user_id==user['id'] and not body.active:raise HTTPException(409,'Cannot deactivate your own account')
    result=store.put('users',{**target,'active':body.active});audit(user,'user_access_updated',user_id);return public_user(result)
@app.get('/api/v1/admin')
def administration(user=Depends(current_user)):
    require(user,{'super_admin'})
    return {'roles':ROLES,'model_provider':settings.model_provider,'model_name':settings.model_name,'rest_configured':bool(settings.village360_url and settings.village360_token),'database_adapter_configured':bool(settings.village360_mongo_uri),'retention_days':settings.retention_days,'audit':store.all('audit',organisation_id=user['organisation_id'])[:200]}

@app.post('/api/v1/snapshots/{snapshot_id}/priority-inputs',status_code=201)
def priority_input(snapshot_id:str,body:PriorityInput,user=Depends(current_user)):
    require(user,EDITORS);snap=scoped('snapshots',snapshot_id,user)
    from .intelligence import diagnose
    if body.finding_id not in {f['id'] for f in diagnose(snap['observations'])}:raise HTTPException(422,'Unknown finding')
    result=store.put('priority_inputs',{'id':digest(snapshot_id+body.finding_id),'organisation_id':user['organisation_id'],'village_id':snap['village_id'],'snapshot_id':snapshot_id,**body.model_dump()})
    audit(user,'priority_assessment_updated',result['id']);return result

@app.post('/api/v1/auth/logout')
def logout(user=Depends(current_user)):
    session=store.get('login_sessions',user['session_id'])
    store.put('login_sessions',{**session,'active':False})
    return {'status':'signed_out'}
