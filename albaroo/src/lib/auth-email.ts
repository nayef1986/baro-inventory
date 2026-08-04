// Section 9.1: field staff are issued a username + password by the Admin, not an
// email address. Supabase Auth is email/password, so we map username -> a synthetic,
// non-deliverable address under a fixed internal domain. This is purely an Auth
// implementation detail — usernames are what Admin/Supervisor/Merchandiser ever see.
//
// Kept out of src/lib/actions/auth.ts because a "use server" file may only export
// async functions — these are plain sync helpers shared by both the sign-in action
// and the Admin user-creation action.
export const AUTH_EMAIL_DOMAIN = 'albaroo.local';

export function usernameToEmail(username: string) {
  return `${username.trim().toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;
}
