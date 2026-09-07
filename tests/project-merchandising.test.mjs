import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDownPaymentStages, validateDownPaymentSchedule, parseLineItems, validDeliveryDate } from '../src/lib/projectMerchandising.ts';

test('split deposit preserves initial 5% plus 5% at month three', () => {
  const form = new FormData();
  form.set('paymentPlan0StagePercent_0', '5');
  form.set('paymentPlan0StageMonth_0', '3');
  assert.deepEqual(parseDownPaymentStages(form, 'paymentPlan0', 5), [{ percent: 5, after_months: 3 }]);
  assert.deepEqual(parseDownPaymentStages(new FormData(), 'paymentPlan0', 10), []);
});

test('rejects overpayment, unordered milestones and malformed values', () => {
  for (const schedule of [[{ percent: 96, after_months: 3 }], [{ percent: 5, after_months: 3 }, { percent: 5, after_months: 2 }], [{ percent: NaN, after_months: 3 }], [{ percent: 5, after_months: 0 }], [{ percent: 5, after_months: 1.5 }]]) {
    assert.throws(() => validateDownPaymentSchedule(5, schedule));
  }
  assert.throws(() => validateDownPaymentSchedule(101, []));
  assert.deepEqual(validateDownPaymentSchedule(5, [{ percent: 95, after_months: 3 }]), [{ percent: 95, after_months: 3 }]);
});

test('rejects half-entered additional payments instead of silently discarding them', () => {
  const form = new FormData(); form.set('offer0StagePercent_0', '5');
  assert.throws(() => parseDownPaymentStages(form, 'offer0', 5), /both/);
});

test('facility and selling point lists clear, normalize and bound input', () => {
  assert.deepEqual(parseLineItems('Pool\r\n EV Charger \nPool', 'Facilities'), ['Pool', 'EV Charger']);
  assert.deepEqual(parseLineItems('', 'Facilities'), []);
  assert.throws(() => parseLineItems('x'.repeat(301), 'Selling points'));
});

test('delivery dates reject impossible calendar dates', () => {
  assert.equal(validDeliveryDate('2028-02-29'), true);
  assert.equal(validDeliveryDate('2027-02-29'), false);
  assert.equal(validDeliveryDate('2028-13-01'), false);
  assert.equal(validDeliveryDate(''), true);
});
