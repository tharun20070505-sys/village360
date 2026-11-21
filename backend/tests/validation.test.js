import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSchemas, schemas } from '../../shared/forms.js';
import { responses } from './fixtures.js';

for (const [kind, schema] of Object.entries(schemas)) {
  test(`accepts a complete synthetic ${kind} response`, () => {
    assert.equal(schema.safeParse(responses(kind)).success, true);
    assert.equal(schema.safeParse({}).success, false);
    assert.equal(draftSchemas[kind].safeParse({}).success, true);
  });
}
test('validates household consent, counts and minimization', () => {
  for (const overrides of [{consent: false}, {accuracy: false}, {children: 8}, {adults: -1}, {fullName: 'Unrequested field'}]) {
    assert.equal(schemas.households.safeParse(responses('households', overrides)).success, false);
  }
});
test('coordinates require explicit consent and a valid pair', () => {
  for (const overrides of [{latitude: 10}, {latitude: 10, longitude: 78}, {latitude: 999, longitude: 78, gpsConsent: true}]) {
    assert.equal(schemas.problems.safeParse(responses('problems', overrides)).success, false);
  }
  assert.equal(schemas.problems.safeParse(responses('problems', {latitude: 10, longitude: 78, gpsConsent: true})).success, true);
});
