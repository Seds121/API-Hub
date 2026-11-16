import { test } from 'node:test';
import assert from 'node:assert/strict';
import { money, applyDiscount, moneyStr } from './money';

test('money avoids float errors', () => {
  assert.equal(money('0.1').plus(money('0.2')).toFixed(6), '0.300000');
  assert.equal(moneyStr(money('0.015').minus('0.005')), '0.010000');
});
test('applyDiscount', () => {
  assert.equal(applyDiscount('0.015', 20).toFixed(6), '0.012000');
  assert.throws(() => applyDiscount('1', 101));
});
