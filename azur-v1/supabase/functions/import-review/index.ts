import {createConnectHandler} from '../../../api/intervals/connect.ts';
import {createCallbackHandler} from '../../../api/intervals/callback.ts';
import {createActivityPreviewHandler} from '../../../api/intervals/activity-preview.ts';
import {createStageActivityHandler} from '../../../api/intervals/stage-activity.ts';
import accept from '../../../api/intervals/accept-activity.ts';
import validate from '../../../api/intervals/validate-load.ts';
import {createStagingImportRouter} from '../../../src/lib/stagingImportRouter.ts';

// Managed secrets stay inside the isolated staging Edge runtime.
// Use a local compatibility object: Edge runtimes forbid mutating Deno.env.
const env={
 VITE_SUPABASE_URL:Deno.env.get('SUPABASE_URL')??'',
 SUPABASE_SERVICE_ROLE_KEY:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',
 AZUR_STAGING_OAUTH:'true',
 INTERVALS_CLIENT_ID:Deno.env.get('INTERVALS_CLIENT_ID')??'',
 INTERVALS_CLIENT_SECRET:Deno.env.get('INTERVALS_CLIENT_SECRET')??'',
 INTERVALS_STAGING_ENABLED:'true',
 INTERVALS_ACCEPTANCE_ENABLED:'true',
 INTERVALS_LOAD_VALIDATION_ENABLED:'true',
};
Object.defineProperty(globalThis,'process',{value:{env},configurable:true,writable:true});
Deno.serve(createStagingImportRouter({url:env.VITE_SUPABASE_URL,serviceKey:env.SUPABASE_SERVICE_ROLE_KEY},{
 'connect':createConnectHandler,
 'callback':createCallbackHandler,
 'activity-preview':createActivityPreviewHandler,
 'stage-activity':createStageActivityHandler,
 'accept-activity':()=>accept,
 'validate-load':()=>validate,
}));
