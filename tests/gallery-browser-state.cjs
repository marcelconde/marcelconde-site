const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function browser(file, storage = new Map(), fetchImpl = async()=>new Response('{}')) {
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      value:'', checked:false, files:[], dataset:{}, style:{}, textContent:'', innerHTML:'', hidden:false,
      classList:{add(){},remove(){},toggle(){}}, listeners:{},
      addEventListener(name, handler){ this.listeners[name]=handler; },
      querySelector(){return element(id+'/child');}, querySelectorAll(){return [];},
      insertAdjacentHTML(){}, setAttribute(){}, appendChild(){}, remove(){},
    });
    return elements.get(id);
  }
  const storageApi = {getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
  const context = vm.createContext({
    document:{querySelector:element,getElementById:id=>element('#'+id),querySelectorAll:()=>[],body:element('body'),addEventListener(){},hidden:false},
    location:{search:'?id=g&slug=race',hash:'',pathname:'/clientes/galeria/',origin:'https://example.test'},
    history:{replaceState(){}},sessionStorage:storageApi,localStorage:storageApi,
    window:{addEventListener(){},CSS:{escape:s=>s}},
    CSS:{escape:s=>s},crypto:webcrypto,URL,URLSearchParams,Headers,Response,Request,FormData,Blob,File,console,
    setTimeout(){return 1;},clearTimeout(){},setInterval(){return 1;},clearInterval(){},
    IntersectionObserver:class {observe(){}},fetch:fetchImpl,
  });
  let source=fs.readFileSync(require.resolve('../'+file),'utf8');
  // Stop automatic page startup; tests drive the real handlers below.
  source=source.slice(0,source.lastIndexOf(file.startsWith('admin')?'loadData().catch':'if (inviteToken)'));
  vm.runInContext(source,context);
  return {context,elements,storage,run:code=>vm.runInContext(code,context),element};
}

test('admin draft survives navigation and media refresh, then clears only acknowledged edits',async()=>{
  const store=new Map();store.set('mc_admin_token','token');
  let resolveSave;
  const a=browser('admin/galerias/galerias.js',store,()=>new Promise(resolve=>{resolveSave=resolve;}));
  a.run(`state.userEmail='admin@example.test';state.selectedGallery={id:'g',title:'Original',status:'selection',selectionLimit:15};renderSelectedGallery();`);
  a.element('#galleryName').value='Changed';a.element('#selectionLimit').value='0';a.element('#galleryStatus').value='editing';
  a.run('rememberDraft();renderSelectedGallery();');
  assert.equal(a.element('#galleryName').value,'Changed');assert.equal(a.element('#selectionLimit').value,0);
  const b=browser('admin/galerias/galerias.js',store);
  b.run(`state.userEmail='admin@example.test';state.selectedGallery={id:'g',title:'Original',selectionLimit:15};renderSelectedGallery();`);
  assert.equal(b.element('#galleryName').value,'Changed');assert.equal(b.element('#galleryStatus').value,'editing');
  const saving=a.run('saveGallery(currentGalleryPayload())');
  a.element('#galleryName').value='Edited during save';a.run('rememberDraft()');
  resolveSave(new Response(JSON.stringify({gallery:{id:'g',title:'Changed',selectionLimit:0,status:'editing'}})));
  await saving;
  assert.equal(a.element('#galleryName').value,'Edited during save');
  assert(store.has('mc_gallery_draft:admin@example.test:g'));
});

test('adding files during upload appends without losing active progress or duplicating files',()=>{
  const a=browser('admin/galerias/galerias.js');
  a.run(`state.selectedGallery={id:'g'};galleryStatus.value='selection';addFiles([new File(['a'],'a.jpg',{lastModified:1}),new File(['b'],'b.jpg',{lastModified:1})]);state.uploading=true;state.uploads[0].status='uploading';state.uploads[0].progress=63;addFiles([new File(['a'],'a.jpg',{lastModified:1}),new File(['c'],'c.jpg',{lastModified:1})]);`);
  assert.equal(a.run('state.uploads.length'),3);
  assert.equal(a.run('state.uploads[0].progress'),63);
  assert.equal(a.run('state.uploads[0].status'),'uploading');
  assert.equal(a.run('state.uploads[2].status'),'pending');
});

test('offline favorites survive reload and replay after authentication without erasing server favorites',async()=>{
  const store=new Map();store.set('mc_client_token','client');
  const a=browser('clientes/galeria/galeria.js',store,async()=>{throw Error('offline');});
  a.run(`state.gallery={id:'g',selectionOwnerId:'c',pricing:{},status:'selection'};toggleFavorite('a',true);toggleFavorite('b',true);`);
  assert.equal(await a.run('flushSelection()'),false);
  const calls=[];
  const b=browser('clientes/galeria/galeria.js',store,async(url,options)=>{
    calls.push(JSON.parse(options.body));return new Response(JSON.stringify({selectedPublicIds:['a','b','c'],pricing:{}}));
  });
  b.run(`state.gallery={id:'g',selectionOwnerId:'c',pricing:{},status:'selection'};restorePendingSelection();acceptSelection(['c']);`);
  assert.deepEqual(Array.from(b.run('[...state.selected]')).sort(),['a','b','c']);
  assert.equal(await b.run('flushSelection()'),true);
  assert.equal(calls[0].changes.length,2);
  assert.equal(store.has('mc_selection_pending:c:g'),false);
  assert.deepEqual(Array.from(b.run('[...state.selected]')).sort(),['a','b','c']);
});

test('click during an in-flight save remains queued after the older response',async()=>{
  const store=new Map();store.set('mc_client_token','client');
  const resolvers=[];
  const a=browser('clientes/galeria/galeria.js',store,()=>new Promise(resolve=>resolvers.push(resolve)));
  a.run(`state.gallery={id:'g',selectionOwnerId:'c',pricing:{},status:'selection'};toggleFavorite('a',true);`);
  const syncing=a.run('flushSelection()');
  a.run(`toggleFavorite('a',false);toggleFavorite('b',true);`);
  resolvers.shift()(new Response(JSON.stringify({selectedPublicIds:['a'],pricing:{}})));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(a.run('state.selected.has("a")'),false);
  assert.equal(a.run('state.selected.has("b")'),true);
  resolvers.shift()(new Response(JSON.stringify({selectedPublicIds:['b'],pricing:{}})));
  assert.equal(await syncing,true);
  assert.deepEqual(Array.from(a.run('[...state.selected]')),['b']);
});

test('failed registration retries the uploaded asset without uploading the file twice',async()=>{
  const a=browser('admin/galerias/galerias.js');
  a.run(`state.selectedGallery={id:'g'};galleryStatus.value='selection';addFiles([new File(['a'],'a.jpg',{lastModified:1})]);
    var transfers=0,registrations=0;
    preparePhotoForCloudinary=async(file)=>file;
    uploadToCloudinary=async()=>{transfers++;return {public_id:'a',secure_url:'https://example.test/a.jpg'};};
    getJson=async(path)=>{if(path.includes('signature'))return {};if(++registrations===1)throw Error('temporary registration failure');return {image:{public_id:'a'}};};`);
  const upload=a.element('#uploadBtn').listeners.click;
  await upload();
  assert.equal(a.run('state.uploads[0].status'),'error');
  await upload();
  assert.equal(a.run('state.uploads[0].status'),'done');
  assert.equal(a.run('transfers'),1);
  assert.equal(a.run('registrations'),2);
});

test('gallery view is stored per gallery and lightbox navigation follows photo order',async()=>{
  const store=new Map();
  const a=browser('clientes/galeria/galeria.js',store);
  a.run(`state.gallery={id:'g',pricing:{},status:'selection'};state.images=[
    {public_id:'a',url:'https://example.test/a.jpg'},
    {public_id:'b',url:'https://example.test/b.jpg'},
    {public_id:'c',url:'https://example.test/c.jpg'}
  ];state.nextCursor=null;setGalleryView('list');openLightbox(state.images[1]);`);
  assert.equal(a.run('state.view'),'list');
  assert.equal(store.get('mc_gallery_view:g'),'list');
  await a.run('moveLightbox(1)');
  assert.equal(a.run('state.currentImage.public_id'),'c');
  await a.run('moveLightbox(1)');
  assert.equal(a.run('state.currentImage.public_id'),'a');
  await a.run('moveLightbox(-1)');
  assert.equal(a.run('state.currentImage.public_id'),'c');
});
