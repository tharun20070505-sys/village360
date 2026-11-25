import time
from contextlib import contextmanager
from typing import TypedDict
from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt, Command
from .store import store,now
from .config import settings
from .models import AgentStrategy, Critique
from .intelligence import model, SYSTEM
import json
from .intelligence import assess,diagnose,prioritise,retrieve,generate_solutions,generate_students,costs_for,verify,digest

class State(TypedDict,total=False):
    run_id:str
    snapshot:dict
    config:dict
    quality:dict
    findings:list
    schemes:list
    solutions:dict
    students:dict
    costs:list
    plan:dict
    issues:list
    retries:int
    decision:dict
    orchestration:dict
    impact:dict
    report:dict

NODES=['orchestrator','data_intelligence','diagnosis','priority','schemes','solutions','budget','students','planning','verification','human_approval','impact','report']

def event(run_id,node,status,summary,**extra):
    store.put('events',{'run_id':run_id,'node':node,'status':status,'summary':summary,**extra})

def graph(checkpointer):
    def wrap(name,fn):
        def run(s):
            started=time.monotonic()
            event(s['run_id'],name,'running','Processing scoped evidence')
            try:
                result=fn(s)
                event(s['run_id'],name,'completed','Output saved; see evidence and calculation details',duration_ms=round((time.monotonic()-started)*1000))
                return result
            except Exception as exc:
                event(s['run_id'],name,'failed',type(exc).__name__)
                raise
        return run
    def orchestrator(s):
        sectors=sorted({o['sector'] for o in s['snapshot']['observations']})
        strategy={'sectors':sectors,'tools':['validate_observations','calculate_priority','retrieve_approved_documents','calculate_budget'],'decision_summary':'Validate all supplied observations and use deterministic calculations before human review.'}
        if s['config']['mode']=='ai':
            strategy=model().with_structured_output(AgentStrategy).invoke([('system',SYSTEM),('human',json.dumps({'objective':s['config']['objective'],'available_sectors':sectors,'task':'Choose relevant available sectors and tools for this objective. Validation, prioritisation and budget calculation are mandatory; scheme retrieval is optional. Return a concise auditable decision summary.'}))]).model_dump()
            strategy['sectors']=[sector for sector in strategy['sectors'] if sector in sectors] or sectors
            strategy['tools']=list(set(strategy['tools'])|{'validate_observations','calculate_priority','calculate_budget'})
        return {'orchestration':{'objective':s['config']['objective'],'selected_sectors':strategy['sectors'],'mode':s['config']['mode'],'tools':strategy['tools'],'decision_summary':strategy['decision_summary'],'limitations':['Analytical mode does not generate AI recommendations'] if s['config']['mode']=='analysis' else []}}
    def schemes(s):
        query=' '.join(f['sector']+' '+f['title'] for f in s['findings'])
        docs=retrieve(query,s['snapshot']['organisation_id']) if query and 'retrieve_approved_documents' in s['orchestration']['tools'] else []
        return {'schemes':[{k:v for k,v in d.items() if k not in ('embedding',)} | {'eligibility_status':'Potential match only; eligibility requires departmental confirmation'} for d in docs]}
    def solutions(s):
        if s['config']['mode']=='analysis' or not s['findings']:
            return {'solutions':{'interventions':[],'status':'not_generated','reason':'AI provider mode required to generate recommendations'}}
        return {'solutions':generate_solutions(s['findings'],s.get('schemes',[]),'\n'.join(s.get('issues',[])))}
    def students(s):
        return {'students':generate_students(s['findings'],s['solutions']) if s['config']['mode']=='ai' and s['findings'] else {'projects':[],'status':'not_generated'}}
    def planning(s):
        content={'snapshot_id':s['snapshot']['id'],'synthetic':s['snapshot']['synthetic'],'objective':s['config']['objective'],'findings':s['findings'],'interventions':s['solutions'].get('interventions',[]),'student_projects':s['students'].get('projects',[]),'costs':s['costs'],'total_estimate':sum(c['total'] for c in s['costs']) if s['costs'] else None,'schemes':s['schemes'],'limitations':['All advice requires human review.','Sample observations are not village-wide prevalence.','Uncosted interventions have unknown budgets.']}
        return {'plan':{**content,'hash':digest(content)}}
    def verification(s):
        issues=verify(s['findings'],s['solutions'],s['students'])
        if s['config']['mode']=='ai':
            review=model().with_structured_output(Critique).invoke([('system',SYSTEM),('human',json.dumps({'evidence':s['findings'],'plan':s['plan'],'task':'Critically review for unsupported factual claims, privacy violations, contradictions and infeasible assumptions. Proposed activities are suggestions, not facts. Return blocking issues only, with specific corrections; do not request fabricated data.'}))]).model_dump()
            issues.extend(review['issues'])
        return {'issues':issues,'retries':s.get('retries',0)+1}
    def approval(s):
        decision=interrupt({'plan_hash':s['plan']['hash'],'message':'Authorised human review required'})
        if decision['plan_hash']!=s['plan']['hash']:raise ValueError('Plan hash mismatch')
        return {'decision':decision}
    def route(s):
        if s['issues']:return 'revision' if s['retries']<3 and s['config']['mode']=='ai' else END
        return 'human_approval'
    g=StateGraph(State)
    functions={'orchestrator':orchestrator,'data_intelligence':lambda s:{'quality':assess(s['snapshot']['observations'])},'diagnosis':lambda s:{'findings':[f for f in diagnose(s['snapshot']['observations']) if f['sector'] in s['orchestration']['selected_sectors']]},'priority':lambda s:{'findings':prioritise(s['findings'],s['config'])},'schemes':schemes,'solutions':solutions,'budget':lambda s:{'costs':costs_for(s['config'].get('costs',[]))},'students':students,'planning':planning,'verification':verification,'impact':lambda s:{'impact':{'status':'awaiting_measurements','message':'Record baseline, target and current indicators on an approved project; no outcomes inferred.'}},'report':lambda s:{'report':{'status':'available','formats':['csv','xlsx','pdf'],'plan_hash':s['plan']['hash']}}}
    for name,fn in functions.items():g.add_node(name,wrap(name,fn))
    g.add_node('human_approval',approval)
    g.add_node('revision',lambda s:{})
    g.add_edge('revision','solutions');g.add_edge('revision','budget')
    g.add_edge(START,'orchestrator');g.add_edge('orchestrator','data_intelligence');g.add_edge('data_intelligence','diagnosis');g.add_edge('diagnosis','priority')
    g.add_edge('priority','schemes');g.add_edge('priority','budget');g.add_edge('schemes','solutions');g.add_edge('solutions','students')
    g.add_edge(['students','budget'],'planning');g.add_edge('planning','verification');g.add_conditional_edges('verification',route)
    g.add_conditional_edges('human_approval',lambda s:'impact' if s['decision']['decision']=='approve' else 'report')
    g.add_edge('impact','report');g.add_edge('report',END)
    return g.compile(checkpointer=checkpointer)

@contextmanager
def checkpoint():
    if settings.mongo_uri:
        from langgraph.checkpoint.mongodb import MongoDBSaver
        with MongoDBSaver.from_conn_string(settings.mongo_uri,db_name=settings.mongo_database) as cp:yield cp
    else:
        from langgraph.checkpoint.sqlite import SqliteSaver
        with SqliteSaver.from_conn_string(str(settings.data_dir/'checkpoints.sqlite')) as cp:yield cp

def execute(run):
    config={'configurable':{'thread_id':run['id']},'recursion_limit':70}
    try:
        with checkpoint() as cp:
            workflow=graph(cp)
            existing=workflow.get_state(config)
            if run.get('resume_decision'): payload=Command(resume=run['resume_decision'])
            elif existing.values:payload=None
            else:payload={'run_id':run['id'],'snapshot':store.get('snapshots',run['snapshot_id']),'config':run['config'],'retries':0}
            workflow.invoke(payload,config)
            state=workflow.get_state(config)
            output=dict(state.values)
            status='awaiting_approval' if state.next else 'blocked' if output.get('issues') else 'completed'
            latest=store.get('runs',run['id'])
            store.put('runs',{**latest,'status':status,'output':output,'finished_at':now()})
            if status=='awaiting_approval':event(run['id'],'human_approval','awaiting_approval','Review the immutable plan and evidence before deciding')
            if status=='completed' and output.get('decision',{}).get('decision')=='approve':
                # Stable ID makes restart/replay idempotent. Approval records remain immutable.
                if not store.get('projects',run['id']):store.put('projects',{'id':run['id'],'organisation_id':run['organisation_id'],'village_id':run['village_id'],'run_id':run['id'],'plan_hash':output['plan']['hash'],'title':run['config']['objective'],'status':'approved','synthetic':output['plan']['synthetic'],'budget':output['plan']['total_estimate']})
    except Exception as exc:
        latest=store.get('runs',run['id'])
        store.put('runs',{**latest,'status':'failed','error':str(exc)[:500]})
        event(run['id'],'orchestrator','failed','Execution stopped; review configuration or retry after correction')
