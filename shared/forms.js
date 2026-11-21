// Version 1 instruments. Persist the schema version on every record.
import { z } from 'zod';

const field = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const pick = (key, label, choices, extra = {}) => field(key, label, 'select', { options: choices.split('|'), ...extra });
const yesNo = (key, label) => pick(key, label, 'Yes|No|Unknown');
const note = (key, label, optional = false) => field(key, label, 'textarea', { optional, max: 1000 });
const count = (key, label, min = 0, max = 10000) => field(key, label, 'number', { min, max });
const consent = (key, label, optional = false) => field(key, label, 'checkbox', { optional });
const section = (title, ...fields) => ({ title, fields });
const locationAndPhoto = section('Optional field evidence',
  consent('gpsConsent', 'Consent obtained to record these coordinates', true),
  field('latitude', 'Latitude', 'coordinate', { min: -90, max: 90, optional: true }),
  field('longitude', 'Longitude', 'coordinate', { min: -180, max: 180, optional: true }),
  consent('photoConsent', 'Permission obtained to attach a photograph of the public site', true));
export const categories = ['Drinking water','Roads','Drainage','Sanitation','Electricity','Streetlights','Waste management','Education infrastructure','Healthcare access','Agriculture / irrigation','Public transport','Other'];
const category = () => field('category', 'Problem category', 'select', { options: categories });
const serviceAccess = (key, label) => pick(key, label, 'Easy|Some difficulty|Very difficult|Unavailable|Unknown');
const participation = () => consent('consent', 'The participant understands the research purpose and agrees to take part voluntarily');
const occupation = 'Agriculture|Wage labour|Small business|Salaried work|Fishing|Livestock|Unpaid household work|Other|Prefer not to say';
const household = [
  section('Survey identification',field('street','Street or area'),participation()),
  section('Household information',field('householdRef','Household reference ID','reference'),count('familyMembers','Total family members',1,500),count('adults','Number of adults',0,500),count('children','Number of children',0,500),pick('livelihood','Household livelihood category',occupation),pick('housing','Housing type','Pucca|Semi-pucca|Kutcha|Other|Unknown'),pick('income','Broad monthly household income','Under ₹10,000|₹10,000–24,999|₹25,000–49,999|₹50,000 or more|Prefer not to say',{optional:true})),
  section('Drinking water',pick('waterSource','Main drinking-water source','Piped supply|Borewell|Open well|Public tap|Tanker|Surface water|Other'),pick('waterAvailability','Water availability','Reliable|Intermittent|Unavailable|Unknown'),pick('waterFrequency','Supply frequency','Continuous|Daily|Several times a week|Weekly or less|Seasonal|Unknown'),yesNo('waterQualityConcern','Drinking-water quality concern'),yesNo('waterShortage','Water shortage reported')),
  section('Sanitation',yesNo('toiletAvailability','Toilet available'),pick('toiletType','Toilet type','Individual|Shared|Community|None|Unknown'),yesNo('drainage','Drainage available'),yesNo('wasteCollection','Waste collection available'),pick('wasteDisposal','Waste disposal method','Door-to-door collection|Community bin|Composting|Open disposal|Burning|Other|Unknown')),
  section('Electricity',yesNo('electricityConnection','Electricity connection'),pick('powerReliability','Power supply reliability','Reliable|Intermittent|Unavailable|Unknown'),yesNo('streetlights','Streetlights available'),yesNo('powerInterruptions','Frequent power interruptions')),
  section('Education',serviceAccess('schoolAccess','School accessibility'),note('educationFacilities','Available educational facilities'),yesNo('internet','Internet available'),note('educationDifficulties','Main educational difficulties')),
  section('Healthcare',pick('healthcareType','Nearest healthcare facility','Sub-centre|Primary health centre|Government hospital|Private clinic|Other|Unknown'),serviceAccess('healthcareAccess','Healthcare accessibility'),yesNo('transport','Transport available'),note('healthcareProblems','Main healthcare access problems')),
  section('Livelihood',pick('occupation','Main occupation category',occupation),note('employmentChallenges','Employment challenges'),pick('agricultureDependence','Agricultural dependence','Main income|Supplementary income|None|Unknown'),note('skills','Skill-development requirements')),
  section('Village problems',category(),field('concern1','First household concern'),field('concern2','Second concern, if raised','text',{optional:true}),field('concern3','Third concern, if raised','text',{optional:true}),note('description','Problem description'),note('improvements','Suggested improvements',true))
];
const instrument = (key, title, singular, sections) => ({ key, title, singular, endpoint: key === 'problems' ? '/problems' : '/surveys/' + key, sections });
export const modules = Object.fromEntries([
  instrument('households','Household surveys','Household survey',household),
  instrument('problems','Village problems','Village problem report',[
    section('Public infrastructure problem',field('street','Street or location description'),category(),field('title','Problem title'),note('description','Detailed description'),pick('severity','Severity','Low|Medium|High|Critical'),count('affectedHouseholds','Approximate households affected',0,1000000)),locationAndPhoto]),
  instrument('infrastructure','Infrastructure observations','Infrastructure observation',[
    section('Location observation',pick('facilityType','Facility type','Road|Water point|Drainage|School|Health facility|Community building|Streetlight|Other'),pick('condition','Condition','Good|Fair|Poor|Unusable'),serviceAccess('accessibility','Accessibility'),note('details','Problem details'),field('location','Location description','text',{optional:true})),locationAndPhoto]),
  instrument('farmers','Farmer interactions','Farmer survey',[
    section('Agricultural livelihood',participation(),field('crops','Main crops'),pick('irrigation','Irrigation source','Rain-fed|Canal|Borewell|Tank|River|Other'),pick('waterAvailability','Water availability','Reliable|Intermittent|Unavailable|Unknown'),note('difficulties','Agricultural difficulties'),note('support','Support requirements'))]),
  instrument('shgs','Self-help groups','Self-help group survey',[
    section('Group activities',participation(),field('groupRef','Group reference ID','reference'),count('memberCount','Member count',1),note('activities','Main activities'),note('financialChallenges','Financial challenges'),note('trainingChallenges','Training challenges'))]),
  instrument('consultations','Panchayat consultations','Panchayat consultation',[
    section('Consultation findings',participation(),field('participantRole','Participant role'),note('projects','Current development projects'),note('issues','Priority issues'),note('actions','Planned actions'))]),
  instrument('students','Student participation','Student participation record',[
    section('Participation',participation(),field('studentId','Student ID','reference'),field('team','Assigned team'),note('assignments','Survey assignments'),count('completedCount','Completed survey count'))])
].map(m => [m.key,m]));

function validator(f) {
  let v;
  if (f.type === 'select') v = z.enum(f.options);
  else if (f.type === 'number') v = z.number().int().min(f.min).max(f.max);
  else if (f.type === 'coordinate') v = z.number().finite().min(f.min).max(f.max);
  else if (f.type === 'checkbox') v = f.optional ? z.boolean() : z.literal(true);
  else if (f.type === 'reference') v = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'Use letters, numbers, dashes or underscores').transform(s => s.toUpperCase());
  else v = z.string().trim().min(1, 'Required').max(f.max || 160);
  return f.optional ? v.optional() : v;
}

function makeSchema(module, draft) {
  const shape = {};
  for (const f of module.sections.flatMap(s => s.fields)) shape[f.key] = draft ? validator(f).optional() : validator(f);
  shape.accuracy = draft ? z.boolean().optional() : z.literal(true);
  return z.object(shape).strict().superRefine((d,ctx) => {
    const issue = (key,message) => ctx.addIssue({ code:'custom', path:[key], message });
    if (module.key === 'households' && d.adults != null && d.children != null && d.familyMembers != null && d.adults + d.children !== d.familyMembers) issue('familyMembers','Adults plus children must equal the total family members');
    if (d.latitude != null || d.longitude != null) {
      if (!d.gpsConsent) issue('gpsConsent','Permission is required for coordinates');
      if (d.latitude == null || d.longitude == null) issue('latitude','Enter both coordinates');
    }
  });
}
export const schemas = Object.fromEntries(Object.values(modules).map(m => [m.key,makeSchema(m,false)]));
export const draftSchemas = Object.fromEntries(Object.values(modules).map(m => [m.key,makeSchema(m,true)]));
