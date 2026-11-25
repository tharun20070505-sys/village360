import csv
import io
import json
import zipfile
from datetime import date
from .models import SnapshotInput

TEMPLATE=['indicator','sector','value','denominator','unit','adverse','source','source_date','verified','latitude','longitude','public_location']

def parse_file(filename,content,village_id,synthetic,source_name):
    suffix=filename.lower().rsplit('.',1)[-1]
    if suffix=='json':
        raw=json.loads(content)
        if isinstance(raw,dict):raw=raw.get('observations',[])
    elif suffix=='csv':raw=list(csv.DictReader(io.StringIO(content.decode('utf-8-sig'))))
    elif suffix=='xlsx':
        from openpyxl import load_workbook
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            if sum(i.file_size for i in archive.infolist())>50_000_000:raise ValueError('Expanded workbook exceeds 50 MB')
        book=load_workbook(io.BytesIO(content),read_only=True,data_only=True)
        rows=book.active.iter_rows(values_only=True);headers=next(rows)
        raw=[dict(zip(headers,r)) for r in rows if any(v is not None for v in r)];book.close()
    elif suffix=='pdf':
        from pypdf import PdfReader
        reader=PdfReader(io.BytesIO(content))
        if len(reader.pages)>100:raise ValueError('PDF is limited to 100 pages')
        text='\n'.join(p.extract_text() or '' for p in reader.pages)
        return {'review_required':True,'extracted_text':text[:100000],'message':'PDF text requires administrative review and mapping to the aggregate import template. No statistics were inferred.'}
    else:raise ValueError('Use JSON, CSV, XLSX or PDF')
    if not isinstance(raw,list) or len(raw)>5000:raise ValueError('Expected at most 5,000 observations')
    for row in raw:
        if not isinstance(row,dict):raise ValueError('Each observation must be an object')
        for k in ('value','denominator','latitude','longitude'):
            if row.get(k) in ('',None):row[k]=None
        for k in ('adverse','verified','public_location'):
            if isinstance(row.get(k),str):
                v=row[k].strip().lower()
                if v not in ('true','false','1','0'):raise ValueError(f'{k} must be true or false')
                row[k]=v in ('true','1')
        if hasattr(row.get('source_date'),'date'):row['source_date']=row['source_date'].date().isoformat()
    return SnapshotInput(village_id=village_id,source_name=source_name,synthetic=synthetic,observations=raw).model_dump(mode='json')

def demo_observations():
    values=[('Water supply','Households with intermittent water',42,120),('Sanitation','Households without toilets',18,120),('Education','Households with difficult school access',22,110),('Healthcare','Households with difficult healthcare access',35,115),('Digital literacy','Households without internet',64,120),('Agriculture','Farmers with unreliable irrigation',16,40),('Employment','Residents requesting skills training',None,None)]
    return [{'sector':sector,'indicator':name,'value':value,'denominator':denominator,'unit':'count','adverse':True,'source':'Synthetic demonstration fixture; not Athipalayam statistics','source_date':date.today().isoformat(),'verified':True,'latitude':None,'longitude':None,'public_location':False} for sector,name,value,denominator in values]
