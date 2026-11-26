import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getTripleNameValidationError,
  getValidNameParts,
  isPersonalAvatarUrl,
  normalizeTripleName,
} from '../src/lib/avatarUtils';

test('normalizeTripleName trims edges and collapses extra spaces', () => {
  assert.equal(normalizeTripleName('  محمد   أحمد   علي  '), 'محمد أحمد علي');
});

test('getTripleNameValidationError rejects empty, single, or two-word names', () => {
  assert.ok(getTripleNameValidationError(''));
  assert.ok(getTripleNameValidationError('محمد'));
  assert.ok(getTripleNameValidationError('محمد أحمد'));
  assert.ok(getTripleNameValidationError('م أ ع'));
});

test('getTripleNameValidationError accepts valid Arabic and Latin triple names', () => {
  assert.equal(getTripleNameValidationError('محمد أحمد علي'), null);
  assert.equal(getTripleNameValidationError('  سارة   محمود   إبراهيم  '), null);
  assert.equal(getTripleNameValidationError('Ziad Khaled Mohammed'), null);
  assert.equal(getValidNameParts('طه علي حسن').length, 3);
});

test('isPersonalAvatarUrl rejects empty, preset asset, and Google account photo URLs', () => {
  assert.equal(isPersonalAvatarUrl(''), false);
  assert.equal(
    isPersonalAvatarUrl('/src/assets/images/avatar_botanical_scholar_1795114445805.jpg'),
    false
  );
  assert.equal(
    isPersonalAvatarUrl('https://lh3.googleusercontent.com/a/ACg8ocK123456=s96-c'),
    false
  );
});

test('isPersonalAvatarUrl accepts uploaded data URLs from device', () => {
  assert.equal(isPersonalAvatarUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(isPersonalAvatarUrl('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(isPersonalAvatarUrl('data:image/webp;base64,UklGRh4='), true);
});
