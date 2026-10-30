// Explicit deployment identities only; never trust Host or forwarded headers for OAuth.
export function intervalsOAuthTarget() {
 const stage=process.env.AZUR_STAGING_OAUTH==='true'||!!process.env.AZUR_STAGING_BACKEND_URL;
 const url=process.env.VITE_SUPABASE_URL;
 if(stage) {
  if(url!=='https://juvceqrzkeethontnezw.supabase.co')return null;
  return {origin:'https://azur-staging.vercel.app',callback:'https://juvceqrzkeethontnezw.supabase.co/functions/v1/import-review/callback'};
 }
 if(url!=='https://tdjxqinhlmlfowqjuvzo.supabase.co')return null;
 return {origin:'https://azur-triathlon.vercel.app',callback:'https://azur-triathlon.vercel.app/api/intervals/callback'};
}
