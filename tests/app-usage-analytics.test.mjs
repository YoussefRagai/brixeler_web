import test from 'node:test';
import assert from 'node:assert/strict';
import { appUsageFilters, usagePercentage } from '../src/lib/appUsageAnalytics.ts';
test('analytics only accepts bounded shared filters',()=>{
  assert.deepEqual(appUsageFilters('7','ios'),{days:7,platform:'ios'});
  assert.deepEqual(appUsageFilters('100000','other'),{days:30,platform:'all'});
  assert.deepEqual(appUsageFilters(),{days:30,platform:'all'});
});
test('empty denominators are not claimed as zero conversion',()=>{
  assert.equal(usagePercentage(0,0),'—');
  assert.equal(usagePercentage(2,4),'50.0%');
});
