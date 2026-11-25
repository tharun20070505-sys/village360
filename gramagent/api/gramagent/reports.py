import csv
import io
from xml.sax.saxutils import escape

def report_bytes(run,format,kind="plan",measurements=None):
    output=run.get('output',{});plan=output.get('plan',{})
    titles={'baseline':'Village baseline analysis','gaps':'Development gap report','priorities':'Priority assessment','schemes':'Government scheme recommendations','students':'Student innovation projects','plan':'Village development action plan','monthly':'Monthly progress report','impact':'Social impact assessment'}
    if kind not in titles:raise ValueError('Unknown report type')
    rows=[['GramAgent AI — '+titles[kind]],['Dataset','SYNTHETIC DEMONSTRATION' if plan.get('synthetic') else 'Imported observations'],['Status',run['status']],['Snapshot',run['snapshot_id']],['Plan hash',plan.get('hash','Not generated')],['Objective',run['config']['objective']],['Limitations','Convenience sample only; estimates require review. Missing data are not zero.'],[],['Finding','Sector','Observed value','Denominator','Priority score','Evidence source']]
    rows += [[f['title'],f['sector'],f['value'],f['denominator'] if f['denominator'] is not None else 'Unknown',f['score'] if f['score'] is not None else 'Unranked',f['source']] for f in output.get('findings',[])]
    rows += [[],['Intervention','Stakeholder','Months','Success indicator']]+[[s['title'],s['stakeholder'],s['duration_months'],s['success_indicator']] for s in plan.get('interventions',[])]
    rows += [[],['Budget item','Quantity','Unit cost','Contingency %','Estimated total','Source']]+[[c['description'],c['quantity'],c['unit_cost'],c['contingency_percent'],c['total'],c['source']] for c in plan.get('costs',[])]
    rows += [[],['Verification issues']]+[[i] for i in output.get('issues',[])]
    if kind=='baseline':
        rows += [[],['Quality metric','Value']]+[[k,v] for k,v in output.get('quality',{}).items() if k not in ('issues',)]
        rows += [[],['Observation','Sector','Value','Denominator','Source date','Source']]+[[o['indicator'],o['sector'],o['value'] if o['value'] is not None else 'Unknown',o.get('denominator'),o['source_date'],o['source']] for o in output.get('snapshot',{}).get('observations',[])]
    if kind in ('schemes','plan'):
        rows += [[],['Scheme','Potential eligibility','Financial assistance','Documents','Application','Department','Official source','Verified date']]+[[d['title'],d.get('eligibility'),d.get('financial_assistance'),d.get('documents'),d.get('procedure'),d.get('department'),d['official_url'],d['verified_date']] for d in plan.get('schemes',[])]
    if kind in ('students','plan'):
        rows += [[],['Student project','Department','Objectives','Technology','Skills','Hardware','Roadmap','Deliverables','Impact indicator']]+[[p['title'],p['department'],'; '.join(p['objectives']),'; '.join(p['technology']),'; '.join(p['skills']),'; '.join(p['hardware']),'; '.join(p['roadmap']),'; '.join(p['deliverables']),p['impact_indicator']] for p in plan.get('student_projects',[])]
    if kind in ('priorities','plan'):
        rows += [[],['Priority calculation and evidence']]+[[f['title'],str(f['calculation'])] for f in output.get('findings',[])]
    if kind in ('monthly','impact'):
        rows += [[],['Indicator','Baseline','Target','Current','Unit','Measured','Progress %','Cumulative spend','Evidence']]+[[m['indicator'],m['baseline'],m['target'],m['current'],m['unit'],m['measured_at'],m.get('progress_percent'),m['spend'],m['evidence']] for m in (measurements or [])]
        if not measurements:rows += [['No measured outcomes have been recorded.']]
        rows += [['Caution','Before/after change does not establish causal attribution. Monthly reports include recorded measurements; group by measurement date when interpreting reporting periods.']]
    def safe(v):
        s=str(v)
        return "'"+s if s.lstrip().startswith(('=','+','-','@')) else s
    if format=='csv':
        buf=io.StringIO();csv.writer(buf).writerows([[safe(c) for c in r] for r in rows]);return ('\ufeff'+buf.getvalue()).encode(),'text/csv'
    if format=='xlsx':
        from openpyxl import Workbook
        from openpyxl.styles import Font,PatternFill
        book=Workbook();sheet=book.active;sheet.title='Development report'
        for r in rows:sheet.append([safe(v) if isinstance(v,str) else v for v in r])
        sheet.freeze_panes='A10';sheet.auto_filter.ref=f'A9:F{9+len(output.get("findings",[]))}'
        for cell in sheet[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='164D42')
        for col in 'ABCDEF':sheet.column_dimensions[col].width=32
        buf=io.BytesIO();book.save(buf);return buf.getvalue(),'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    if format=='pdf':
        from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer
        from reportlab.lib.styles import getSampleStyleSheet
        buf=io.BytesIO();styles=getSampleStyleSheet()
        story=[]
        for i,row in enumerate(rows):
            if not row:story.append(Spacer(1,12));continue
            story.append(Paragraph(escape(' | '.join(str(v) for v in row)),styles['Title'] if i==0 else styles['BodyText']))
            story.append(Spacer(1,6))
        SimpleDocTemplate(buf).build(story);return buf.getvalue(),'application/pdf'
    raise ValueError('Unsupported format')
