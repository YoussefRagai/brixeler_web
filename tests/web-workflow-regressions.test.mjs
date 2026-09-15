import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
const require = createRequire(import.meta.url);
function load(path, mocks = {}, expose = '') {
  const code = ts.transpileModule(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText + expose;
  const loadedModule = { exports: {} };
  new Function('require', 'module', 'exports', code)((id) => mocks[id] ?? require(id), loadedModule, loadedModule.exports);
  return loadedModule.exports;
}
test('unit type price edit preserves stored image; explicit null removes; upload replaces', async () => {
  let persisted = { hero_image_url: 'existing.jpg' };
  const supabaseServer = { from(table) {
    const query = { select() { return this; }, eq() { return this; }, is() { return this; }, order() { return this; }, limit() { return this; }, update(value) { persisted = { ...persisted, ...value }; return this; },
      maybeSingle: async () => ({ data: table === 'developer_projects' ? { id: 'project', developer_id: 'developer' } : table === 'developer_project_phases' ? { id: 'phase' } : { id: 'unit', project_id: 'project' }, error: null }), single: async () => ({ data: { id: 'unit' }, error: null }) };
    return query;
  } };
  const api = load('src/lib/developerQueries.ts', { './supabaseServer': { supabaseServer }, './projectMerchandising': {} });
  const payload = { id: 'unit', phaseId: 'phase', label: 'Apartment', minPrice: 100 };
  await api.upsertProjectUnitType('developer','project',payload);
  assert.equal(persisted.hero_image_url, 'existing.jpg');
  await api.upsertProjectUnitType('developer','project',{...payload,heroImageUrl:null});
  assert.equal(persisted.hero_image_url, null);
  await api.upsertProjectUnitType('developer','project',{...payload,heroImageUrl:'new.jpg'});
  assert.equal(persisted.hero_image_url, 'new.jpg');
});
test('removal ignores existing submitted URLs but an ordinary edit keeps them', () => {
  const { retainedMediaInput } = load('src/lib/mediaEdit.ts');
  for (const key of ['project_brochure','project_masterplan','project_images','voice_notes','project_videos','project_logo','project_inventory']) {
    const form = new FormData(); form.set('url', 'https://cdn.company.com/current');
    assert.equal(retainedMediaInput(form,key,'url'),'https://cdn.company.com/current');
    form.set(`${key}_remove`,'1'); assert.equal(retainedMediaInput(form,key,'url'),null);
  }
});
test('failed combined creation carries created project into retry without duplicating it', async () => {
  let projectCreates = 0; const listingProjects = [];
  const api = load('src/app/developer/listings/new/page.tsx', {
    'next/navigation': { redirect: (url) => { throw new Error(url); } },
    '@/components/DeveloperLayout': {}, '@/components/DeveloperListingWizard': {},
    '@/lib/developerAuth': { requireDeveloperCapability: async () => ({ developerId: 'tenant' }) },
    '@/lib/developerQueries': { upsertDeveloperProject: async () => { projectCreates++; return { data: { id: 'retained-project' } }; }, createDeveloperListing: async (_tenant, payload) => { listingProjects.push(payload.projectId); return { error: new Error('Injected listing failure') }; }, validateDeveloperProjectPhase: async () => ({}) },
    '@/lib/developerListingMedia': { resolveDeveloperListingMedia: async () => ({ photoUrls: ['a','b','c'], uploadedObjects: [] }) },
    '@/lib/storageServer': { removeUploadedStorageObjects: async () => {} },
  }, '\nexports.action = createListingAction;');
  const form = new FormData();
  for (const [key,value] of Object.entries({ name:'Listing', description:'Valid description', saleType:'developer_sale', price:'100000', bedrooms:'2', bathrooms:'1', unitArea:'100', installmentYears:'5', downPayment:'10', createProjectName:'New project' })) form.set(key,value);
  let recovery;
  try { await api.action(form); } catch (error) { recovery=new URL(error.message,'https://local'); }
  assert.equal(recovery.searchParams.get('project'),'retained-project'); assert.equal(recovery.searchParams.get('retryProject'),'1');
  form.set('projectId',recovery.searchParams.get('project'));
  await assert.rejects(api.action(form),/retryProject/);
  assert.equal(projectCreates,1); assert.deepEqual(listingProjects,['retained-project','retained-project']);
});
test('operational export selects canonical stages and commission restricts SalesClaim', async () => {
  const calls=[];
  const supabaseServer={from(table) { calls.push(['from',table]); const q={range(){return q;},select(value){calls.push(['select',value]);return q;},order(){return q;},eq(k,v){calls.push(['eq',k,v]);return q;},then(resolve){return Promise.resolve({data:[{id:'mobile-stage',stage:'SalesClaim',status:'Submitted'}],error:null}).then(resolve);}}; return q; }};
  const api=load('src/lib/adminExports.ts',{'./supabaseServer':{supabaseServer},'./adminRoles':{},'./csv':{ csvCell:v=>v },'./reportRows':load('src/lib/reportRows.ts')});
  const rows=await api.loadAdminExportRows('commissions');
  assert.equal(rows[0].id,'mobile-stage'); assert.deepEqual(calls[0],['from','workspace_operations']); assert.ok(calls.some(c=>c.join('|')==='eq|stage|SalesClaim'));
});
test('reports page past 1000 rows and fail visibly on later-page errors', async () => {
  const { readReportRows }=load('src/lib/reportRows.ts');
  const fixture=Array.from({length:1001},(_,id)=>({id}));
  assert.equal((await readReportRows({range:async(from,to)=>({data:fixture.slice(from,to+1),error:null})})).length,1001);
  await assert.rejects(readReportRows({range:async(from,to)=>({data:fixture.slice(from,to+1),error:from?new Error('Page failed'):null})}),/Page failed/);
});
