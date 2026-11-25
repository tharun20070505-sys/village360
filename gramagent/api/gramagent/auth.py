from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pwdlib import PasswordHash
import jwt
import uuid
from .config import settings
from .store import store

passwords = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
EDITORS = {'super_admin','panchayat_officer','college_admin','faculty','field_coordinator'}
APPROVERS = {'super_admin','panchayat_officer'}

def token(user):
    session_id=str(uuid.uuid4())
    store.put('login_sessions',{'id':session_id,'user_id':user['id'],'active':True})
    return jwt.encode({'jti':session_id,'sub':user['id'],'iss':'gramagent','aud':'gramagent-web','exp':datetime.now(timezone.utc)+timedelta(hours=2)},settings.jwt_secret,algorithm='HS256')

def current_user(credentials: HTTPAuthorizationCredentials | None=Depends(bearer)):
    try:
        payload=jwt.decode(credentials.credentials if credentials else '',settings.jwt_secret,algorithms=['HS256'],issuer='gramagent',audience='gramagent-web')
        user=store.get('users',payload['sub'])
        session=store.get('login_sessions',payload['jti'])
        if not user or not user.get('active') or not session or not session.get('active') or session['user_id']!=user['id']: raise ValueError()
        user={**user,'session_id':payload['jti']}
        return user
    except (jwt.PyJWTError,ValueError,KeyError): raise HTTPException(401,'Sign in to continue')

def require(user, roles):
    if user['role'] not in roles: raise HTTPException(403,'Your role does not permit this action')

def scoped(collection,identifier,user):
    doc=store.get(collection,identifier)
    if not doc or doc.get('organisation_id')!=user['organisation_id']: raise HTTPException(404,'Resource not found')
    village=doc.get('village_id',doc['id'] if collection=='villages' else None)
    if user['role']!='super_admin' and village and village not in user.get('village_ids',[]): raise HTTPException(403,'Village is outside your assignments')
    return doc

def visible(doc,user):
    return doc.get('organisation_id')==user['organisation_id'] and (user['role']=='super_admin' or doc.get('village_id',doc['id']) in user.get('village_ids',[]))

def public_user(user):
    return {k:v for k,v in user.items() if k not in ('password_hash','session_id')}

def bootstrap():
    if not settings.bootstrap_email or not settings.bootstrap_password: return
    if len(settings.bootstrap_password)<16: raise RuntimeError('Bootstrap password requires 16 characters')
    if store.all('users',email=settings.bootstrap_email.lower()): return
    store.put('users',{'email':settings.bootstrap_email.lower(),'name':'Administrator','password_hash':passwords.hash(settings.bootstrap_password),'role':'super_admin','organisation_id':'pilot','village_ids':[],'active':True})
