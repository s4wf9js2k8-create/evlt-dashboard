// UID is the only account identity. Names and email aliases are not deletion keys.
export async function revokeAccount(db, auth, uid) {
  const tokens = (await db.ref('push_tokens').get()).val() || {};
  const tokenKeys = Object.keys(tokens).filter(key => tokens[key]?.uid === uid);
  const binding = db.ref('EVLT_ACCOUNT_BINDINGS/' + uid);
  const request = db.ref('EVLT_ACCOUNT_REQUESTS/' + uid);
  const [beforeBinding, beforeRequest] = await Promise.all([binding.get(), request.get()]);
  const updates = {
    ['EVLT_ACCOUNT_BINDINGS/' + uid]: null,
    ['EVLT_ACCOUNT_REQUESTS/' + uid]: null,
    ['EVLT_SYSTEM_ADMIN_UIDS/' + uid]: null
  };
  for (const key of tokenKeys) updates['push_tokens/' + key] = null;
  await db.ref().update(updates);
  // Always retry Auth cleanup, even when a previous attempt removed the DB records.
  let authDisabled = false;
  try {
    await auth.updateUser(uid, { disabled: true });
    await auth.revokeRefreshTokens(uid);
    authDisabled = true;
  } catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
  }
  const checks = await Promise.all([
    binding.get(), request.get(), db.ref('EVLT_SYSTEM_ADMIN_UIDS/' + uid).get()
  ]);
  if (checks.some(snapshot => snapshot.val() != null)) {
    throw new Error('Account access changed during revocation. Retry to confirm removal.');
  }
  return {
    success: true,
    removedBindings: beforeBinding.val() == null ? 0 : 1,
    removedRequests: beforeRequest.val() == null ? 0 : 1,
    // Name-keyed legacy permissions may belong to another person; leave them intact.
    removedLegacyPermissions: 0,
    removedPushTokens: tokenKeys.length,
    authDisabled
  };
}

// Fail closed if the account is missing, disabled, unverified, or no longer approved.
export async function activePushUid(db, auth, uid) {
  if (typeof uid !== 'string' || !uid || /[.#$\[\]\/]/.test(uid)) return false;
  try {
    const [user, binding, admin] = await Promise.all([
      auth.getUser(uid),
      db.ref('EVLT_ACCOUNT_BINDINGS/' + uid).get(),
      db.ref('EVLT_SYSTEM_ADMIN_UIDS/' + uid).get()
    ]);
    if (user.disabled || !user.emailVerified) return false;
    const account = binding.val();
    return admin.val() === true || (account?.approved === true && !!user.email && account.email === user.email);
  } catch (error) {
    if (error.code === 'auth/user-not-found') return false;
    throw error; // Infrastructure errors must not silently mark a notification delivered.
  }
}
