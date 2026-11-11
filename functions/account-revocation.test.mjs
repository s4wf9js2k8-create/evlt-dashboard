import test from 'node:test';
import assert from 'node:assert/strict';
import { revokeAccount, activePushUid } from './account-revocation.js';

function fixture() {
  const root = {
    EVLT_ACCOUNT_BINDINGS: { a: { approved: true, volunteerName: 'Alex', email: 'a@example.test' }, b: { approved: true, volunteerName: 'Alex', email: 'b@example.test' } },
    EVLT_ACCOUNT_REQUESTS: { a: { name: 'Alex' }, b: { name: 'Alex' } },
    EVLT_SYSTEM_ADMIN_UIDS: { a: true },
    EVLT_ADMIN_DB: { userPermissions: { Alex: { documents: true } }, volunteers: [{ name: 'Alex' }] },
    push_tokens: { first: { uid: 'a' }, second: { uid: 'a' }, other: { uid: 'b' }, legacy: { user: 'Alex' } }
  };
  const users = { a: { email: 'a@example.test', emailVerified: true }, b: { email: 'b@example.test', emailVerified: true } };
  const calls = [];
  const db = { ref(path = '') { return {
    async get() { return { val: () => path.split('/').filter(Boolean).reduce((value, key) => value?.[key], root) ?? null }; },
    async update(updates) { for (const [path, value] of Object.entries(updates)) { const parts = path.split('/'); const key = parts.pop(); const parent = parts.reduce((obj, part) => obj[part] ||= {}, root); if (value === null) delete parent[key]; else parent[key] = value; } }
  }; } };
  const auth = {
    async getUser(uid) { if (!users[uid]) throw Object.assign(Error('missing'), { code: 'auth/user-not-found' }); return users[uid]; },
    async updateUser(uid, change) { calls.push(['disable', uid]); Object.assign(await this.getUser(uid), change); },
    async revokeRefreshTokens(uid) { calls.push(['revoke', uid]); }
  };
  return { root, users, calls, db, auth };
}

test('revoke exact UID, retain same-name person, history and ambiguous legacy permissions', async () => {
  const f = fixture(); const result = await revokeAccount(f.db, f.auth, 'a');
  assert.equal(result.removedPushTokens, 2);
  assert.equal(f.root.EVLT_ACCOUNT_BINDINGS.a, undefined);
  assert.equal(f.root.EVLT_SYSTEM_ADMIN_UIDS.a, undefined);
  assert.equal(f.root.EVLT_ACCOUNT_REQUESTS.a, undefined);
  assert.equal(f.root.EVLT_ACCOUNT_BINDINGS.b.approved, true);
  assert.equal(f.root.EVLT_ACCOUNT_REQUESTS.b.name, 'Alex');
  assert.equal(f.root.push_tokens.other.uid, 'b');
  assert.equal(f.root.EVLT_ADMIN_DB.userPermissions.Alex.documents, true);
  assert.equal(f.root.EVLT_ADMIN_DB.volunteers.length, 1);
  assert.deepEqual(f.calls, [['disable', 'a'], ['revoke', 'a']]);
  assert.equal(await activePushUid(f.db, f.auth, 'a'), false);
  assert.equal(await activePushUid(f.db, f.auth, 'b'), true);
});
test('retry after Auth failure completes even with approval already removed', async () => {
  const f = fixture(); const original = f.auth.updateUser;
  f.auth.updateUser = async () => { throw Error('temporary failure'); };
  await assert.rejects(revokeAccount(f.db, f.auth, 'a'));
  f.auth.updateUser = original;
  assert.equal((await revokeAccount(f.db, f.auth, 'a')).authDisabled, true);
  assert.equal((await revokeAccount(f.db, f.auth, 'a')).success, true);
});
test('missing Auth account still removes database access', async () => {
  const f = fixture(); delete f.users.a;
  assert.equal((await revokeAccount(f.db, f.auth, 'a')).authDisabled, false);
  assert.equal(f.root.EVLT_ACCOUNT_BINDINGS.a, undefined);
});
test('push rejects missing UID, deleted user, disabled user, unverified user and unapproved user', async () => {
  const f = fixture();
  for (const uid of [undefined, '', 'missing', 'a/b']) assert.equal(await activePushUid(f.db, f.auth, uid), false);
  f.users.b.disabled = true; assert.equal(await activePushUid(f.db, f.auth, 'b'), false);
  f.users.b.disabled = false; f.users.b.emailVerified = false; assert.equal(await activePushUid(f.db, f.auth, 'b'), false);
  f.users.b.emailVerified = true; f.root.EVLT_ACCOUNT_BINDINGS.b.approved = false; assert.equal(await activePushUid(f.db, f.auth, 'b'), false);
});
test('push checks email binding and permits active administrators only', async () => {
  const f = fixture(); f.users.b.email = 'changed@example.test';
  assert.equal(await activePushUid(f.db, f.auth, 'b'), false);
  delete f.root.EVLT_ACCOUNT_BINDINGS.a; assert.equal(await activePushUid(f.db, f.auth, 'a'), true);
  f.users.a.disabled = true; assert.equal(await activePushUid(f.db, f.auth, 'a'), false);
});
test('push authorization infrastructure errors propagate without sending', async () => {
  const f = fixture(); f.auth.getUser = async () => { throw Error('unavailable'); };
  await assert.rejects(activePushUid(f.db, f.auth, 'a'), /unavailable/);
});
