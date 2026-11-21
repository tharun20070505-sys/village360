// Entirely synthetic responses for the version 1 survey instruments.
import { modules } from '../../shared/forms.js';

const answers = {
  street: 'Canal path', householdRef: 'PILOT-HH-01', groupRef: 'PILOT-SHG-01', studentId: 'PILOT-ST-01',
  familyMembers: 4, adults: 2, children: 2, title: 'Blocked public drain', description: 'Standing water near the crossing.',
  concern1: 'Regular drain maintenance', memberCount: 8, team: 'Field team A', affectedHouseholds: 6,
  crops: 'Millet', projects: 'Repair of the common water point', participantRole: 'Ward representative'
};

export function responses(kind, overrides = {}) {
  const data = {accuracy: true};
  for (const field of modules[kind].sections.flatMap(section => section.fields)) {
    if (field.optional) continue;
    if (field.key in answers) data[field.key] = answers[field.key];
    else if (field.type === 'select') data[field.key] = field.options[0];
    else if (field.type === 'checkbox') data[field.key] = true;
    else if (field.type === 'number') data[field.key] = Math.max(1, field.min);
    else data[field.key] = 'Observed during a synthetic pilot visit';
  }
  return {...data, ...overrides};
}
