/*
 * Composer API Browser v3.6.0 isolated integration tests.
 * Purpose: regression-test existing live-API behavior and Jellyfin 12.2
 *          Material UI Music/Artists navigation + removal/reinsertion.
 * Requirements: Node.js 18+; no npm packages and no Jellyfin connection.
 * Safety: read-only VM and fake DOM, no network or filesystem writes.
 * Run: node test_composer_api_v3_6_0.js
 */
'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
class Node {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.children = []; this.dataset = {};
    this.style = {}; this.attributes = {}; this.listeners = {};
    this.className = ''; this.id = ''; this.textContent = '';
    this.parentElement = null; this.hidden = false; this.scrollTop = 0;
    this.classList = {
      add: x => { this.className += ' ' + x; },
      remove: x => { this.className = this.className.split(' ').filter(y => y !== x).join(' '); },
      contains: x => this.className.split(' ').includes(x)
    };
  }
  get isConnected() { return this.tagName === 'BODY' || this.tagName === 'HEAD' || !!(this.parentElement && this.parentElement.isConnected); }
  appendChild(n) { if(n.parentElement) n.remove(); this.children.push(n); n.parentElement = this; return n; }
  replaceChildren(...nodes) { for (const n of this.children) n.parentElement = null; this.children = []; nodes.forEach(x => this.appendChild(x)); }
  setAttribute(k,v) { this.attributes[k]=String(v); }
  getAttribute(k) { return this.attributes[k] || ''; }
  addEventListener(k,f) { this.listeners[k] = f; }
  getClientRects() { return this.hidden ? [] : [1]; }
  insertAdjacentElement(pos,node) {
    assert.equal(pos,'afterend');
    assert.ok(this.parentElement,'cannot insert beside orphan');
    if (node.parentElement) node.remove();
    const ix = this.parentElement.children.indexOf(this);
    this.parentElement.children.splice(ix+1,0,node);
    node.parentElement = this.parentElement;
  }
  remove() { if(this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this),1); this.parentElement=null; }
  closest(selector) {
    let node = this;
    if(selector[0] !== '#') return null;
    while(node) { if(node.id === selector.slice(1)) return node; node=node.parentElement; }
    return null;
  }
  focus() {}
  setSelectionRange() {}
  querySelector(selector) {
    if(selector.startsWith('.')) return find(this, n => n.classList.contains(selector.slice(1)));
    return null;
  }
}
function all(node,pred,list=[]) {
  if(pred(node)) list.push(node);
  for(const child of node.children) all(child,pred,list);
  return list;
}
function find(node,pred) { return all(node,pred)[0] || null; }
const head = new Node('head');
const body = new Node('body');
const document = {
  head, body, readyState:'complete',
  createElement: x => new Node(x),
  getElementById: x => find(body,n => n.id === x) || find(head,n => n.id === x),
  querySelectorAll: sel => {
    if(sel === 'a[href]') return all(body,n => n.tagName==='A' && !!n.getAttribute('href'));
    if(sel === 'button') return all(body,n => n.tagName==='BUTTON');
    throw new Error('Unexpected DOM selector: ' + sel);
  },
  addEventListener: () => {}
};
function make(parent,tag,label,klass='',href='') {
  const n=new Node(tag); n.textContent=label; n.className=klass;
  if(href) n.setAttribute('href',href);
  parent.appendChild(n); return n;
}
const menu = make(body,'div','');
const musicHref='#/music?topParentId=7e64e319657a9516ec78490da03edccb&collectionType=music';
const musicVideosHref='#/musicvideos?topParentId=e2c00f297a5f80af390f52f72e782147&collectionType=musicvideos';
const legacyMusic=make(menu,'a','Music','lnkMediaFolder navMenuOption emby-button',musicHref);
legacyMusic.hidden=true;
const videos=make(menu,'a','Music Videos','MuiButtonBase-root MuiButton-root',musicVideosHref);
const modernMusic=make(menu,'a','Music','MuiButtonBase-root MuiButton-root MuiButton-textPrimary MuiButton-sizeMedium css-example',musicHref);
const tabs=make(body,'div','');
const artists=make(tabs,'button','Artists','MuiButtonBase-root MuiButton-root MuiButton-textInherit MuiButton-sizeLarge css-real-tab');
const composerId = '19753d214c0c27f832859365118aaed0';
const people = Array.from({length:567},(_,n)=>({
  Id:n===0?composerId:(n+1).toString(16).padStart(32,'0'),
  Name:n===0?'3 Doors Down':n===1?'Colin Cripps;Kathleen Edwards':n===2?'Kathleen Edwards':n===3?';Robbie Robertson':'Orphan Composer '+n,
  Overview:n===0?'An example artist':n===2?'Kathleen biography':'', ImageTags:n===0||n===2?{Primary:'x'}:{}
}));
const requests=[];
const writes=[];
let remoteBiography='An example artist';
let virtualBackup={};
const pluginRecords={};
const audio=[
  {Id:'1'.repeat(32),Name:'Let Me Go',Album:'Let Me Go',AlbumId:'a'.repeat(32),IndexNumber:1,People:[{Name:'3 Doors Down',Id:composerId,Type:'Composer'}]},
  {Id:'2'.repeat(32),Name:'Here Without You',Album:'Away From The Sun',AlbumId:'b'.repeat(32),AlbumArtists:[{Name:'3 Doors Down',Id:'x'}],IndexNumber:3,People:[{Name:'3 Doors Down',Id:composerId,Type:'Composer'}]},
  {Id:'3'.repeat(32),Name:'Another Song',Album:'Away From The Sun',AlbumId:'b'.repeat(32),AlbumArtists:[{Name:'3 Doors Down',Id:'x'}],IndexNumber:8,People:[{Name:'3 Doors Down',Id:composerId,Type:'Composer'}]},
  {Id:'4'.repeat(32),Name:'Colin and Kathleen',Album:'Collaborations',AlbumId:'c'.repeat(32),People:[{Name:'Colin Cripps;Kathleen Edwards',Id:people[1].Id,Type:'Composer'}]},
  {Id:'5'.repeat(32),Name:'One Credit',Album:'Collaborations',AlbumId:'c'.repeat(32),People:[{Name:'Colin Cripps;Kathleen Edwards',Id:people[1].Id,Type:'Composer'}]},
  {Id:'6'.repeat(32),Name:'Kathleen Solo',Album:'Solo Album',AlbumId:'d'.repeat(32),People:[{Name:'Kathleen Edwards',Id:people[2].Id,Type:'Composer'}]},
  {Id:'7'.repeat(32),Name:'Robbie Song',Album:'Another Album',AlbumId:'e'.repeat(32),People:[{Name:';Robbie Robertson',Id:people[3].Id,Type:'Composer'}]}
];
const apiClient={
  getUrl:p=>'http://jellyfin.test/'+p,
  getCurrentUserId:()=> 'logged-in-user',
  getScaledImageUrl:(id,opts)=>'http://jellyfin.test/image/'+id+'?tag='+(opts.tag||''),
  serverId:()=> 'mockserver',
  ajax: async options => {
    writes.push(options);
    const requestUrl = new URL(options.url);
    const pathname=requestUrl.pathname;
    if (pathname === '/ComposerSharedMetadata/record') {
      assert.equal(options.type, 'PUT');
      const key=requestUrl.searchParams.get('key');
      const body=JSON.parse(options.data);
      assert.equal(body.ExpectedRevision, pluginRecords[key]?.revision || 0);
      pluginRecords[key]={key,overview:body.Overview,name:body.Name,revision:body.ExpectedRevision+1,imageFile:body.ImageDataUrl ? 'saved.png' : ''};
      return null;
    }
    if (pathname.endsWith('/Images/Primary')) {
      assert.equal(pathname,'/Items/'+composerId+'/Images/Primary');
      assert.equal(options.contentType,'image/png');
      assert.equal(options.data,'FAKEBASE64');
      return null;
    }
    assert.fail('Never write to native Jellyfin item API: '+pathname);
    assert.equal(options.contentType,'application/json');
    const dto=JSON.parse(options.data);
    assert.equal(dto.Id,composerId);
    assert.equal(dto.Type,'Person');
    assert.ok(Array.isArray(dto.People),'full DTO must retain People');
    remoteBiography=dto.Overview;
    return null;
  },
  getJSON: async u=>{
    requests.push(u);
    const url=new URL(u);
    const i=Number(url.searchParams.get('StartIndex')||0), l=Number(url.searchParams.get('Limit')||200);
    if(url.pathname === '/ComposerSharedMetadata/records') return {schemaVersion:1,records:pluginRecords};
    if(url.pathname === '/ComposerSharedMetadata/image-data') return {imageDataUrl:'data:image/png;base64,FAKEBASE64'};
    if(url.pathname === '/Users/Me') return {Policy:{IsAdministrator:true}};
    if(url.pathname === '/Items/'+composerId) return {Id:composerId,Name:'3 Doors Down',Type:'Person',Overview:remoteBiography,People:[],ImageTags:{Primary:'x'}};
    if(url.pathname === '/Persons') {
      assert.equal(url.searchParams.get('PersonTypes'),'Composer');
      assert.equal(url.searchParams.get('UserId'),'logged-in-user');
      return {TotalRecordCount:567,Items:people.slice(i,i+l)};
    }
    if(url.pathname === '/Items') {
      if(url.searchParams.get('IncludeItemTypes') === 'Audio') {
        assert.equal(url.searchParams.get('PersonIds'),null);
        assert.equal(url.searchParams.get('Fields'),'People');
        return {TotalRecordCount:audio.length,Items:audio.slice(i,i+l)};
      }
      if(url.searchParams.get('IncludeItemTypes') === 'MusicArtist') return {Items:[]};
    }
    throw new Error('Unexpected request '+u);
  }
};
const window={
  localStorage:{getItem:()=>Object.keys(virtualBackup).length ? JSON.stringify(virtualBackup):null,setItem:(_k,v)=>{virtualBackup=JSON.parse(v);}},confirm:()=>true,
  alert:()=>{}, ApiClient:apiClient, setInterval:()=>1, clearInterval:()=>{},
  addEventListener:()=>{}, location:{hash:'#/home',pathname:'/web/index.html'}
};
class MockReader {
  readAsDataURL(file) { this.result='data:'+file.type+';base64,'+file.base64; this.onload(); }
}
const ctx=vm.createContext({window,document, console, URL, Date, Promise,setTimeout,FileReader:MockReader});
const source=fs.readFileSync(path.join(__dirname,'..','web','jellyfin_composers_api_browser_v3_6_0.js'),'utf8');
vm.runInContext(source,ctx);
assert.ok(!/items\.forEach\s*\(\s*function/.test(source),
  'do not declare a callback inside the Composer pagination while loop');
assert.ok(!/var work\s*=\s*\(async function/.test(source),
  'do not use an anonymous async pagination IIFE (old line 137)');
assert.ok(/async function fetchPeoplePages\(\)/.test(source) &&
  /var work = fetchPeopleAndAudio\(\);/.test(source),
  'readPeople should call the named pagination helper');
const ui=window.__jfComposerApiV31;
// Regression: the body/header must no longer be artificially capped at 1200px.
const stylesheet=document.getElementById('jfca-v31-style');
assert.ok(stylesheet && /\.jfca-body\{width:100%;max-width:none;/.test(stylesheet.textContent),
  'Composer container should span the viewport');
assert.ok(/\.jfca-grid\{[^}]*repeat\(auto-fill,minmax\(min\(100%,180px\),1fr\)\)/.test(stylesheet.textContent),
  'composer cards should flow into responsive columns');
assert.ok(!stylesheet.textContent.includes('1200px'),
  'fixed-width 1200px panel/header should be removed');
// Regression: Jellyfin 12 AlbumArtists entries may be objects with Name/Id.
const fallbackGrouped=ui.groupAlbums([
  {Id:'7'.repeat(32),Album:'Without Album ID',AlbumArtists:[{Name:'Example Orchestra',Id:'a'}]},
  {Id:'8'.repeat(32),Album:'Without Album ID',AlbumArtists:[{Name:'Example Orchestra',Id:'a'}]}
]);
assert.equal(fallbackGrouped.length,1,'same name/artist without AlbumId should group');
assert.equal(fallbackGrouped[0].tracks.length,2);
assert.equal(fallbackGrouped[0].artist,'Example Orchestra');
assert.ok(!fallbackGrouped[0].artist.includes('[object Object]'));

function click(node) {
  assert.ok(node && node.listeners.click,'click handler missing');
  let prevented=false,stopped=false;
  node.listeners.click({preventDefault(){prevented=true;},stopPropagation(){stopped=true;},stopImmediatePropagation(){}});
  assert.equal(prevented,true); assert.equal(stopped,true);
}
async function run() {
  assert.equal(ui.version,'3.6.0');
  assert.equal(ui.status().shortcut,true);
  assert.equal(ui.status().musicTab,false,'no Music tab on Home');
  assert.equal(ui.status().navLink,true,'visible Modern Music link should be matched globally');
  assert.equal(document.getElementById('jfca-v31-nav').parentElement, menu);
  assert.equal(document.getElementById('jfca-v31-nav').getAttribute('href'),musicHref);
  assert.ok(menu.children.indexOf(document.getElementById('jfca-v31-nav'))===menu.children.indexOf(modernMusic)+1);
  assert.ok(menu.children.indexOf(document.getElementById('jfca-v31-nav'))!==menu.children.indexOf(videos)+1);
  window.location.hash=musicHref;
  ui.rescan();
  assert.equal(ui.status().onMusicPage,true);
  assert.equal(ui.status().musicTab,true);
  assert.equal(ui.status().musicTabVisible,true);
  assert.equal(ui.status().placement,'beside Artists');
  const musicTab=document.getElementById('jfca-v31-music-tab');
  assert.equal(tabs.children.indexOf(musicTab),tabs.children.indexOf(artists)+1);
  assert.ok(musicTab.className.includes('MuiButton-sizeLarge'),'MUI class must match nearby tab');
  assert.equal(musicTab.textContent,'Composers');
  assert.equal(ui.status().musicTabInsertions,1);
  ui.rescan(); ui.rescan();
  assert.equal(ui.status().musicTabInsertions,1,'idempotent scan');
  click(musicTab);
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ui.status().opened,true);
  assert.equal(ui.status().peopleLoaded,4, 'only credited logical composers appear');
  assert.equal(ui.status().audioScanned,7);
  assert.equal(ui.status().creditedAudio,7);
  assert.equal(ui.status().hiddenUncreditedPeople,563);
  assert.equal(ui.status().combinedPeople,1);
  const audit=ui.audit();
  assert.equal(audit.combinedPeople[0].Name,'Colin Cripps;Kathleen Edwards');
  assert.ok(audit.hiddenUncreditedPeople.some(x=>x.Name==='Orphan Composer 10'));
  const logical=await ui.people();
  assert.ok(logical.some(x=>x.Name==='Colin Cripps'));
  assert.ok(logical.some(x=>x.Name==='Kathleen Edwards' && x.Overview==='Kathleen biography'));
  assert.ok(logical.some(x=>x.Name==='Robbie Robertson'));
  assert.ok(!logical.some(x=>x.Name.includes(';') || x.Name.includes('Orphan Composer')));
  assert.equal((await ui.albums(logical.find(x=>x.Name==='Colin Cripps').Id))[0].tracks.length,2);
  assert.equal((await ui.albums(logical.find(x=>x.Name==='Kathleen Edwards').Id)).length,2);
  assert.equal(ui.status().jellyfinTotal,567);
  assert.equal(requests.filter(x=>x.includes('/Persons')).length,3);
  const albums=await ui.albums(composerId);
  assert.equal(albums.length,2);
  assert.equal(albums.find(x=>x.name==='Away From The Sun').tracks.length,2);
  const panel=document.getElementById('jfca-v31-panel');
  panel.listeners.click({target:{closest:()=>({dataset:{personId:composerId}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ui.status().lastAlbumCount,2);
  assert.equal(ui.status().mode,'detail');
  const descriptions=all(panel,n => n.className === 'jfca-sub').map(n => n.textContent);
  assert.ok(descriptions.includes('2 credited songs'),
    'album subtitle should contain the number of credited songs');
  assert.ok(descriptions.includes('1 credited song'),
    'singular credited-song subtitle should be correct');
  assert.ok(descriptions.every(t => !t.includes('[object Object]') && !t.includes('3 Doors Down')),
    'album subtitle must omit DTO object stringification and artist names');
  ui.close();
  const old=musicTab; old.remove();
  ui.rescan();
  assert.equal(ui.status().musicTab,true,'recover after React re-render removes injected node');
  assert.equal(ui.status().musicTabInsertions,2);
  window.location.hash='#/home'; ui.rescan();
  assert.equal(ui.status().musicTab,false,'tab must disappear off Music route');
  assert.equal(ui.status().navLink,true,'menu shortcut persists');
  window.location.hash=musicVideosHref; ui.rescan();
  assert.equal(ui.status().musicTab,false,'Music Videos must not match Music');
  window.location.hash=musicHref;
  artists.remove(); ui.rescan();
  assert.equal(ui.status().musicTab,false,'do not attach a fake tab to unrelated content');
  assert.equal(ui.status().shortcut,true,'fallback remains');
  assert.ok(requests.filter(x=>x.includes('/Persons?')||x.includes('/Items?')).every(x=>x.includes('UserId=logged-in-user')));
  assert.ok(requests.every(x=>x.includes('Persons?')||x.includes('Items?')||x.includes('Users/Me')||x.includes('ComposerSharedMetadata')));
  assert.equal(requests.filter(x=>x.includes('IncludeItemTypes=Audio')).length,1, 'one paginated audio catalog query, not N composer queries');
  // Administrator metadata edit is opt-in: no writes until Preview + Confirm Save.
  window.location.hash=musicHref;
  artists.parentElement && ui.rescan();
  await ui.show();
  panel.listeners.click({target:{closest:()=>({dataset:{personId:composerId}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ui.status().mode,'detail');
  panel.listeners.click({target:{closest:()=>({dataset:{action:'edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ui.status().mode,'edit');
  assert.equal(writes.length,0,'opening editor must not write');
  const bioField=document.getElementById('jfca-edit-overview');
  assert.ok(bioField,'biography editor exists');
  bioField.value='A corrected biography from the administrator.';
  panel.listeners.click({target:{closest:()=>({dataset:{action:'preview-edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(writes.length,0,'preview must be read-only');
  panel.listeners.click({target:{closest:()=>({dataset:{action:'save-edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(writes.length,1,'only explicit save may PUT plugin data');
  assert.equal(new URL(writes[0].url).pathname,'/ComposerSharedMetadata/record');
  assert.equal(remoteBiography,'An example artist','native Jellyfin Person must not be changed');
  assert.equal(pluginRecords['person:'+composerId].overview,'A corrected biography from the administrator.');
  assert.equal(ui.status().mode,'detail');
  // Virtual composer edits must never call a Jellyfin metadata endpoint.
  const virtual=logical.find(x=>x.Name==='Colin Cripps');
  panel.listeners.click({target:{closest:()=>({dataset:{personId:virtual.Id}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  panel.listeners.click({target:{closest:()=>({dataset:{action:'edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(ui.status().mode,'edit');
  document.getElementById('jfca-edit-overview').value='Colin virtual biography';
  panel.listeners.click({target:{closest:()=>({dataset:{action:'preview-edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  panel.listeners.click({target:{closest:()=>({dataset:{action:'save-edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(writes.length,2,'virtual Save writes only the plugin, not Jellyfin metadata');
  assert.equal(writes[1].type,'PUT');
  assert.equal(new URL(writes[1].url).pathname,'/ComposerSharedMetadata/record');
  assert.equal(pluginRecords[virtual._jfcaKey].overview,'Colin virtual biography');
  assert.equal(Object.keys(virtualBackup).length,0,'new saves must not modify browser local storage');
  assert.equal(ui.status().mode,'detail');
  // Primary picture upload uses base64 body + exact image MIME (never raw binary).
  panel.listeners.click({target:{closest:()=>({dataset:{personId:composerId}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  panel.listeners.click({target:{closest:()=>({dataset:{action:'edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  const upload=document.getElementById('jfca-image-upload');
  panel.listeners.change({target:{id:'jfca-image-upload',files:[{name:'portrait.png',type:'image/png',size:10,base64:'FAKEBASE64'}]}});
  panel.listeners.click({target:{closest:()=>({dataset:{action:'preview-edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  panel.listeners.click({target:{closest:()=>({dataset:{action:'save-edit'}})}});
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(writes.length,3,'picture-only save should issue one plugin PUT');
  assert.equal(new URL(writes[2].url).pathname,'/ComposerSharedMetadata/record');
  assert.equal(JSON.parse(writes[2].data).ImageDataUrl,'data:image/png;base64,FAKEBASE64');
  assert.equal(ui.status().mode,'detail');
  // Migration: v3.3 local edit must be copied to shared plugin storage, with source preserved.
  const otherVirtual=logical.find(x=>x.Name==='Robbie Robertson');
  virtualBackup[otherVirtual._jfcaKey]={Name:otherVirtual.Name,Overview:'Imported on first computer',ImageDataUrl:''};
  await ui.show();
  panel.listeners.click({target:{closest:()=>({dataset:{action:'migrate-local'}})}});
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(pluginRecords[otherVirtual._jfcaKey].overview,'Imported on first computer');
  assert.equal(virtualBackup[otherVirtual._jfcaKey].Overview,'Imported on first computer','source local edit must remain');
  assert.equal(ui.status().sharedPluginReady,true);
  assert.equal(ui.status().sharedRecords,3);
  // Simulate another browser with an empty local store. The plugin still provides data.
  virtualBackup={};
  await ui.refresh();
  const afterRefresh=await ui.people();
  assert.equal(afterRefresh.find(x=>x.Name==='Robbie Robertson').Overview,'Imported on first computer');
  assert.equal(afterRefresh.find(x=>x.Name==='Colin Cripps').Overview,'Colin virtual biography');
  assert.equal(afterRefresh.find(x=>x.Name==='3 Doors Down').Overview,'A corrected biography from the administrator.');
  assert.equal(remoteBiography,'An example artist','Jellyfin People remain unchanged across the simulated session');
  console.log('PASS: v3.3 migration skips existing records, preserves local backup, and shared edits survive empty localStorage');
  console.log('PASS: v3.6.0 admin editor writes real and virtual composer overlays ONLY to shared plugin, with no Jellyfin People/DB writes');
  console.log('PASS: Jellyfin 12 MUI Artists tab, direct Music menu, no Music Videos match, React tab recovery, Home cleanup; 567 People / 4 credited composers / split names / orphan suppression / 2 albums / read-only API');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
