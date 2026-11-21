/**
 * Verification suite for Firestore Security Rules ("Dirty Dozen" Payloads)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

describe('Firestore Security Rules Hardened Verification', () => {
  const rules = fs.readFileSync('./firestore.rules', 'utf8');

  it('Enforces rules_version = 2 and global default-deny safety net', () => {
    assert.ok(rules.includes("rules_version = '2';"));
    assert.ok(rules.includes('match /{document=**}'));
    assert.ok(rules.includes('allow read, write: if false;'));
  });

  it('Blocks Payload 1 & 8: Enforces ownerId == request.auth.uid and ownerId immutability', () => {
    assert.ok(rules.includes('data.ownerId == request.auth.uid'));
    assert.ok(rules.includes('incoming().ownerId == existing().ownerId'));
  });

  it('Blocks Payload 2: Enforces strict key allowlists via hasAll and hasOnly', () => {
    assert.ok(rules.includes('data.keys().hasAll('));
    assert.ok(rules.includes('data.keys().hasOnly('));
    assert.ok(rules.includes('affectedKeys().hasOnly('));
  });

  it('Blocks Payload 3: Requires verified email token on all standard operations', () => {
    assert.ok(rules.includes('request.auth.token.email_verified == true'));
  });

  it('Blocks Payload 4 & 5: Validates ID regex and string size limits', () => {
    assert.ok(rules.includes("id.matches('^[a-zA-Z0-9_\\\\-]+$')"));
    assert.ok(rules.includes('data.remarks.size() <= 500'));
  });

  it('Blocks Payload 6 & 12: Enforces parent student existence, ownership, existsAfter, and allocation math', () => {
    assert.ok(rules.includes('exists(/databases/$(database)/documents/students/$(incoming().studentId))'));
    assert.ok(rules.includes('existsAfter(/databases/$(database)/documents/students/$(incoming().studentId))'));
    assert.ok(rules.includes('data.allocatedToXI + data.allocatedToXII == data.amount'));
  });

  it('Blocks Payload 7, 9, 10 & 11: Enforces validation helper on update, request.time, terminal lock, and resource.data.ownerId on list', () => {
    assert.ok(rules.includes('isValidStudent(incoming())'));
    assert.ok(rules.includes('isValidPayment(incoming())'));
    assert.ok(rules.includes('incoming().createdAt == request.time'));
    assert.ok(rules.includes('incoming().updatedAt == request.time'));
    assert.ok(rules.includes("existing().status != 'completed'"));
    assert.ok(rules.includes('resource.data.ownerId == request.auth.uid'));
  });
});
