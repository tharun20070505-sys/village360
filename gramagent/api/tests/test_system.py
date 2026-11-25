import io
import json
from datetime import date,timedelta
from fastapi.testclient import TestClient
from gramagent.main import app
from gramagent.store import store
from gramagent.workflow import execute
from gramagent.intelligence import assess,diagnose,prioritise,verify,retrieve
from gramagent.models import Observation,Scenario
from gramagent.imports import parse_file,demo_observations
from gramagent.auth import token
import pytest

@pytest.fixture()
def client():
    with TestClient(app) as c:yield c

@pytest.fixture()
def auth(client):
    r=client.post('/api/v1/auth/login',json={'email':'admin@example.test','password':'test-password-very-long-123'})
    assert r.status_code==200,r.text
    return {'Authorization':'Bearer '+r.json()['access_token']}

def test_missing_values_and_denominators_are_not_zero():
    obs=demo_observations()
    q=assess(obs)
    assert q['valid_values']==6 and q['completeness']==85.7
    row=obs[0]|{'denominator':None}
    findings=prioritise(diagnose([row]),{'severity_weight':.6,'freshness_weight':.4})
    assert findings[0]['score'] is None
    assert assess([])['completeness'] is None
    assert len(diagnose([obs[0],obs[0]]))==1

def test_validation_rejects_invalid_statistics():
    row=demo_observations()[0]
    for change in [{'value':121},{'value':float('nan')},{'source_date':(date.today()+timedelta(days=1)).isoformat()},{'latitude':11,'longitude':77}]:
        with pytest.raises(ValueError):Observation(**(row|change))
    with pytest.raises(ValueError):Scenario(budget=100,unit_cost=0,people_per_unit=2,months=1,monthly_capacity=1,assumptions='test assumptions')

def test_csv_excel_imports_and_rejected_unknown_columns():
    text='indicator,sector,value,denominator,unit,adverse,source,source_date,verified\nNo water,Water supply,,100,count,true,Test source,2025-01-01,true\n'
    result=parse_file('baseline.csv',text.encode(),'village',True,'test')
    assert result['observations'][0]['value'] is None
    from openpyxl import Workbook
    book=Workbook();sheet=book.active
    rows=list(__import__('csv').reader(io.StringIO(text)))
    for row in rows:sheet.append(row)
    buf=io.BytesIO();book.save(buf)
    assert parse_file('baseline.xlsx',buf.getvalue(),'village',True,'test')['observations'][0]['denominator']==100
    with pytest.raises(ValueError):parse_file('bad.json',json.dumps([demo_observations()[0]|{'household_name':'Private'}]).encode(),'village',False,'test')

def test_end_to_end_checkpoint_approval_reports_and_impact(client,auth):
    assert client.get('/api/v1/villages').status_code==401
    snap=client.post('/api/v1/demo',headers=auth).json()
    again=client.post('/api/v1/demo',headers=auth).json()
    assert snap['id']==again['id']
    response=client.post('/api/v1/runs',headers=auth,json={'snapshot_id':snap['id'],'mode':'analysis'})
    assert response.status_code==202,response.text
    run=response.json();execute(run)
    run=store.get('runs',run['id'])
    assert run['status']=='awaiting_approval',run
    assert len(run['output']['findings'])==6
    assert run['output']['plan']['total_estimate'] is None
    assert run['output']['solutions']['interventions']==[]
    assert run['output']['quality']['completeness']==85.7
    stale=client.post(f"/api/v1/runs/{run['id']}/decision",headers=auth,json={'plan_hash':'stale','decision':'approve','reason':'Reviewed evidence'})
    assert stale.status_code==409
    body={'plan_hash':run['output']['plan']['hash'],'decision':'approve','reason':'Synthetic workflow verified for demonstration'}
    response=client.post(f"/api/v1/runs/{run['id']}/decision",headers=auth,json=body)
    assert response.status_code==202,response.text
    assert client.post(f"/api/v1/runs/{run['id']}/decision",headers=auth,json=body).status_code==409
    # Rebuild graph/checkpointer, then resume the persisted interrupt.
    execute(response.json())
    completed=store.get('runs',run['id']);assert completed['status']=='completed',completed
    assert store.get('projects',run['id'])['synthetic'] is True
    for format in ['csv','xlsx','pdf']:
        response=client.get(f"/api/v1/runs/{run['id']}/report?format={format}",headers=auth)
        assert response.status_code==200 and len(response.content)>200
        if format=='pdf':assert response.content.startswith(b'%PDF')
        if format=='csv':assert b'SYNTHETIC DEMONSTRATION' in response.content
    impact=client.post(f"/api/v1/projects/{run['id']}/observations",headers=auth,json={'indicator':'Households without water','baseline':40,'target':0,'current':20,'unit':'households','measured_at':date.today().isoformat(),'evidence':'Synthetic measurement fixture','spend':1000})
    assert impact.status_code==201,impact.text
    assert impact.json()['progress_percent']==50

def test_scope_roles_inactive_users_and_ai_unavailability(client,auth):
    snap=client.post('/api/v1/demo',headers=auth).json()
    other=store.put('users',{'name':'Other tenant','email':'other@example.test','organisation_id':'another','active':True,'role':'super_admin'})
    h={'Authorization':'Bearer '+token(other)}
    assert client.post('/api/v1/runs',headers=h,json={'snapshot_id':snap['id']}).status_code==404
    viewer=store.put('users',{'name':'Viewer','email':'viewer@example.test','organisation_id':'pilot','active':True,'role':'public_viewer','village_ids':[snap['village_id']]})
    h={'Authorization':'Bearer '+token(viewer)}
    assert client.post('/api/v1/demo',headers=h).status_code==403
    assert client.get('/api/v1/snapshots?village_id='+snap['village_id'],headers=h).status_code==403
    assert client.get('/api/v1/projects',headers=h).status_code==200
    store.put('users',viewer|{'active':False})
    assert client.get('/api/v1/projects',headers=h).status_code==401
    assert client.post('/api/v1/runs',headers=auth,json={'snapshot_id':snap['id'],'mode':'ai'}).status_code==409

def test_costs_and_scenarios_are_deterministic(client,auth):
    snap=client.post('/api/v1/demo',headers=auth).json()
    cost={'finding_id':'f-0','description':'Synthetic cost fixture','quantity':2,'unit_cost':100,'source':'Test quotation','contingency_percent':10}
    assert client.post('/api/v1/snapshots/'+snap['id']+'/costs',headers=auth,json=cost).status_code==201
    assert client.post('/api/v1/snapshots/'+snap['id']+'/costs',headers=auth,json=cost|{'finding_id':'unknown'}).status_code==422
    result=client.post('/api/v1/scenarios',headers=auth,json={'budget':500000,'unit_cost':25000,'people_per_unit':10,'months':6,'monthly_capacity':3,'assumptions':'Synthetic unit cost and delivery capacity'}).json()
    assert result['units']==18 and result['potential_coverage']==180 and result['remaining_budget']==50000

def test_critic_and_scheme_freshness():
    assert verify([],{'interventions':[{'finding_id':'fake','title':'Bad source','evidence_ids':['fake'],'sdgs':[22]}]},{'projects':[]})
    store.put('knowledge',{'organisation_id':'retrieval-test','title':'Water assistance','text':'Water infrastructure funding support','reviewed':True,'verified_date':(date.today()-timedelta(days=200)).isoformat()})
    assert retrieve('water','retrieval-test')==[]
    store.put('knowledge',{'organisation_id':'retrieval-test','title':'Water assistance','text':'Water infrastructure funding support','reviewed':True,'verified_date':date.today().isoformat()})
    assert len(retrieve('water','retrieval-test'))==1

def test_ai_graph_retries_and_bounded_verification(monkeypatch,client,auth):
    import gramagent.workflow as wf
    from gramagent.models import AgentStrategy,Critique
    snap=client.post('/api/v1/demo',headers=auth).json()
    calls={'solutions':0,'critic':0}
    class Structured:
        def __init__(self,schema):self.schema=schema
        def invoke(self,messages):
            if self.schema is AgentStrategy:return AgentStrategy(sectors=['Water supply'],tools=['retrieve_approved_documents'],decision_summary='Focus on evidenced water issues')
            calls['critic']+=1
            return Critique(issues=['Clarify proposed action'] if calls['critic']<3 else [])
    class FakeModel:
        def with_structured_output(self,schema):return Structured(schema)
    def solutions(*args):
        calls['solutions']+=1
        return {'interventions':[{'finding_id':'f-0','title':'Review the water distribution schedule','category':'community','description':'Review local evidence with the Panchayat','evidence_ids':['e-0'],'stakeholder':'Panchayat','duration_months':1,'success_indicator':'Document verified service schedule','risks':['Survey coverage'],'dependencies':['Local review'],'sdgs':[6]}]}
    monkeypatch.setattr(wf,'model',lambda:FakeModel())
    monkeypatch.setattr(wf,'generate_solutions',solutions)
    monkeypatch.setattr(wf,'generate_students',lambda *args:{'projects':[]})
    run=store.put('runs',{'organisation_id':'pilot','village_id':snap['village_id'],'snapshot_id':snap['id'],'status':'queued','config':{'mode':'ai','objective':'Review water evidence','severity_weight':.6,'freshness_weight':.4,'costs':[]}})
    execute(run)
    result=store.get('runs',run['id'])
    assert result['status']=='awaiting_approval',result
    assert calls=={'solutions':3,'critic':3}
    assert result['output']['findings'][0]['id']=='f-0'
    assert result['output']['orchestration']['selected_sectors']==['Water supply']

def test_mcda_missing_criteria_are_excluded():
    from gramagent.models import PriorityInput
    assessment=PriorityInput(finding_id='f-0',severity=80,data_reliability=60,evidence='Human-reviewed synthetic rubric').model_dump()
    ranked=prioritise(diagnose([demo_observations()[0]]),{'severity_weight':.6,'freshness_weight':.4,'priority_inputs':[assessment]})
    assert ranked[0]['score']==73.33
    assert ranked[0]['calculation']['weight_coverage']==pytest.approx(.3)

def test_logout_revokes_token(client,auth):
    assert client.post('/api/v1/auth/logout',headers=auth).status_code==200
    assert client.get('/api/v1/auth/me',headers=auth).status_code==401

def test_all_report_types_are_available(client,auth):
    snap=client.post('/api/v1/demo',headers=auth).json()
    run=client.post('/api/v1/runs',headers=auth,json={'snapshot_id':snap['id']}).json();execute(run)
    for kind in ['baseline','gaps','priorities','schemes','students','plan','monthly','impact']:
        r=client.get('/api/v1/runs/'+run['id']+'/report?format=csv&kind='+kind,headers=auth)
        assert r.status_code==200,r.text
        assert 'SYNTHETIC DEMONSTRATION' in r.text

def test_expired_worker_lease_recovers_without_stealing_live_work():
    from gramagent.worker import recover_expired,deadline
    old=store.put('runs',{'status':'running','lease_until':'2000-01-01T00:00:00+00:00','worker_id':'old'})
    live=store.put('runs',{'status':'running','lease_until':deadline(),'worker_id':'live'})
    recover_expired()
    assert store.get('runs',old['id'])['status']=='queued'
    assert store.get('runs',live['id'])['status']=='running'
    assert store.claim('runs',live['id'],'running',{'status':'queued'},conditions={'worker_id':'wrong'}) is None
