"""Read-only adapter for the inspected Village 360 v1 schema. Credentials MUST have read role only."""
from .config import settings

def snapshot_from_database(village_id):
    if not settings.village360_mongo_uri:raise ValueError('Read-only source database URI is not configured')
    from pymongo import MongoClient
    from bson import ObjectId
    fields=[('waterAvailability','Unavailable','Households without water','Water supply'),('toiletAvailability','No','Households without toilets','Sanitation'),('electricityConnection','No','Households without electricity','Infrastructure'),('schoolAccess','Unavailable','Households without school access','Education'),('healthcareAccess','Unavailable','Households without healthcare access','Healthcare'),('internet','No','Households without internet','Digital literacy')]
    with MongoClient(settings.village360_mongo_uri,serverSelectionTimeoutMS=5000) as client:
        db=client[settings.village360_database];observations=[]
        for field,adverse,indicator,sector in fields:
            rows=list(db.household_surveys.aggregate([{'$match':{'village':ObjectId(village_id),'status':'Verified','data.consent':True,'data.'+field:{'$exists':True,'$nin':[None,'Unknown','Prefer not to say']}}},{'$group':{'_id':None,'denominator':{'$sum':1},'value':{'$sum':{'$cond':[{'$eq':['$data.'+field,adverse]},1,0]}},'source_date':{'$min':'$surveyDate'}}}]))
            if not rows:continue
            row=rows[0];n=row['denominator'];v=row['value']
            if n<5 or 0<v<5 or 0<n-v<5:continue
            observations.append({'indicator':indicator,'sector':sector,'value':v,'denominator':n,'unit':'count','adverse':True,'source':f'Village 360 verified aggregate / {village_id} / {field}','source_date':row['source_date'].date().isoformat(),'verified':True})
    return {'source_name':'Village 360 read-only database aggregate','synthetic':False,'observations':observations}
