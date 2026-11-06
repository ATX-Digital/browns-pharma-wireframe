import {readFile, writeFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const snapshotUrl=new URL('../versions/v1.html',import.meta.url);
const html=await readFile(snapshotUrl,'utf8');
const writeFields=process.argv.includes('--write-fields');
let source=html.match(/<script>([\s\S]*?)<\/script>/)[1];
if(writeFields)source=source.replace(/const EDITABLE_FIELDS=\[[^;]*\];/,'const EDITABLE_FIELDS=[];');
const listeners={document:{},window:{}};
const nodes=new Map();
function node(id){if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',hidden:false,open:false,style:{},dataset:{},offsetHeight:1000,classList:{contains(){return false;},add(){},remove(){},toggle(){}},focus(){},setAttribute(){},getBoundingClientRect(){return {height:1000};},querySelectorAll(){return [];},showModal(){this.open=true;},close(){this.open=false;}});return nodes.get(id);}
const document={body:{classList:{contains(){return false;},toggle(){}}},getElementById:node,querySelectorAll(){return [];},querySelector(){return null;},addEventListener(type,fn){(listeners.document[type]??=[]).push(fn);}};
const storage=new Map();
const location={hash:'#home',protocol:'http:',origin:'http://127.0.0.1:4173'};
const window={innerHeight:900,scrollY:0,scrollTo(){},addEventListener(type,fn){(listeners.window[type]??=[]).push(fn);},removeEventListener(){}};
window.window=window;
const ctx=vm.createContext({document,window,parent:window,location,history:{replaceState(a,b,url){location.hash=url;}},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},ResizeObserver:class{observe(){}},requestAnimationFrame(){},setTimeout(fn){fn();return 1;},clearTimeout(){},URLSearchParams,Intl,Date,console,FormData:class{constructor(form){this.data=form.values||{};}[Symbol.iterator](){return (Array.isArray(this.data)?this.data:Object.entries(this.data))[Symbol.iterator]();}}});
vm.runInContext(source,ctx,{filename:fileURLToPath(snapshotUrl)});
const run=code=>vm.runInContext(code,ctx);
const goto=route=>{location.hash='#'+route;run('render()');return node('app').innerHTML;};
const decode=x=>x.replaceAll('&amp;','&').replaceAll('&#39;',"'").replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>');
const pages=run('PAGES.map(p=>p.id)');
const seen=new Set(),queue=[...pages,...run('LINK_TARGETS.map(t=>t.route)')];
const renders=[];
while(queue.length){const route=queue.shift();if(seen.has(route)||route==='main-content')continue;assert.ok(seen.size<2500,'Unexpected route loop');seen.add(route);let body;try{body=goto(route);}catch(error){throw new Error(`Rendering ${route}: ${error.message}`);}
 assert.ok(body.includes('<main '),route+' has main');assert.ok(!body.includes('undefined'),route+' contains undefined');
 assert.equal((body.match(/<h1\b/g)||[]).length,1,route+' must have one h1');
 for(const match of body.matchAll(/href="#([^"]*)"/g)){const dest=decode(match[1]);if(dest==='main-content')continue;assert.ok(pages.includes(dest.split('?')[0]),`${route} links to unknown route ${dest}`);queue.push(dest);}
 renders.push([route,body]);
}
// Completion screens and contextual entry panels have fields absent from their initial empty states.
run("bookingDone={name:'Health Check',variant:'Health Check',location:'pieta',doctor:'',date:futureDates()[0],time:'09:00'}; orderDone={items:[{id:'health-check',variant:'Health Check',qty:1},{id:'laser-hair-removal',variant:'Treatment package',qty:2}],total:740};");
for(const route of ['booking-confirmation','order','service?id=health-check','pharmacy?id=pieta','components']){goto(route);run('openBooking();closeDialog()');}
// Cover editable variation keys for every detail and brand record, then all checkout/booking states.
run("cart=[{id:'health-check',variant:'Health Check',qty:1}]");
for(const route of ['cart','checkout','checkout?stage=payment','checkout?stage=payment&state=failed','book?service=health-check','book?demo=1&step=3','book?demo=1&step=4','book?doctor=stephanie-grech','book?step=1','book?step=2','beauty-results?treatment=body-sculpting','beauty-results?treatment=skin-rejuvenation','beauty-results?treatment=cryotherapy','beauty-results?treatment=teeth-whitening'])goto(route);
function submit(name,values,serviceId){const form={dataset:{form:name,...(serviceId?{service:serviceId}:{})},values,reportValidity(){return true;},querySelector(){return {disabled:false,textContent:''};},reset(){},elements:{countryName:{reportValidity(){return false;}}}};for(const fn of listeners.document.submit||[])fn({target:form,preventDefault(){}});}
// Follow a complete guest appointment, including backwards edits and a new contextual entry.
run("booking={service:'',variant:'',location:'',preferredLocation:'',doctor:'',date:'',time:'',details:{},step:1};bookingDone=null;");
goto('book');submit('booking',{service:'health-check'});assert.equal(run('booking.step'),2);
submit('booking',{variant:'Health Check',location:'pieta'});assert.equal(run('booking.step'),3);
submit('booking',{date:run('futureDates()[0]'),time:'09:00'});assert.equal(run('booking.step'),4);
submit('booking',{firstName:'Example',lastName:'Customer',email:'example@example.test',phone:'00000000',consent:'on'});
assert.equal(run('active'),'booking-confirmation');assert.equal(run('bookingDone.location'),'pieta');assert.equal(run('Object.keys(booking.details).length'),0);
goto('book?service=health-check');assert.equal(run('booking.step'),2,'Direct service entry starts at choices, not stale final step');
goto('book?doctor=stephanie-grech');assert.equal(run('booking.step'),3);assert.equal(run('booking.location'),run("doctor('stephanie-grech').place"));
goto('book?location=qormi');assert.equal(run('booking.step'),1);assert.equal(run('booking.preferredLocation'),'qormi');submit('booking',{service:'allergy-test'});assert.equal(run('booking.location'),'qormi');
// Quick booking groups every service once; floating entry respects scroll and quiet sections.
goto('home');run('openBooking()');
const quickOptions=node('booking-dialog').innerHTML;
assert.ok(quickOptions.includes('<optgroup label="Health services">'));
assert.ok(quickOptions.includes('<optgroup label="Beauty services">'));
assert.equal((quickOptions.match(/<option value="[^"]+"/g)||[]).length,run('SERVICES.length'));
run('closeDialog();syncBookingControl(false)');assert.equal(node('floating-book').hidden,true);
run('syncBookingControl(true)');assert.equal(node('floating-book').hidden,false);
for(const route of ['investors','investor?section=announcements']){goto(route);run('syncBookingControl(true)');assert.equal(node('floating-book').hidden,true);}
// Changing a service clears the slot and incompatible pharmacy, preserves entered details.
run("booking.details={firstName:'Example'};booking.time='10:30';booking.date=futureDates()[0];setBookingService('oral-microbiome');");
assert.equal(run('booking.location'),'');assert.equal(run('booking.time'),'');assert.equal(run('booking.details.firstName'),'Example');
// Availability states and invalid deep links have useful recovery.
assert.ok(goto('book?demo=1&step=3&state=no-slots').includes('No times available'));
assert.ok(goto('book?demo=1&step=3&state=slot-lost').includes('no longer available'));assert.equal(run('booking.time'),'');
assert.ok(goto('service?id=not-a-service').includes('could not be found'));
assert.ok(goto('doctors?q=zz-no-match').includes('No doctors match'));
assert.ok(goto('pharmacies?q=zz-no-match').includes('No pharmacies match'));
// Purchase journey: variant pricing, totals, checkout and a separate order outcome.
run('cart=[];orderDone=null;');submit('add-cart',{variant:'Treatment package'},'laser-hair-removal');assert.equal(run('active'),'cart');assert.equal(run('cartTotal()'),360);
run("addCart('health-check','Health Check')");assert.equal(run('cartTotal()'),380);
goto('checkout');submit('checkout',{firstName:'Example',lastName:'Customer',email:'example@example.test',phone:'00000000',address:'Example address',town:'Example town',postcode:'AAA0000',country:'MT',terms:'on'});assert.equal(run('params.get("stage")'),'payment');
goto('checkout?stage=payment&state=failed');assert.equal(run('cart.length'),2);assert.ok(node('app').innerHTML.includes('did not complete'));
run('completeOrder()');assert.equal(run('active'),'order');assert.equal(run('cart.length'),0);assert.equal(run('orderDone.total'),380);assert.equal(run('Object.keys(checkoutDraft).length'),0);assert.ok(node('app').innerHTML.includes('appointment still needs'));
assert.ok(![...storage.values()].join('').includes('example@example.test'),'No personal details persisted');
// Expanded data, large directories and independent appointments.
assert.equal(run('BRANCHES.length'),29);
assert.equal(run('LEADERSHIP.length'),7);
assert.equal(run('BOARD.length'),8);
assert.equal(run('ANNOUNCEMENTS.length'),42);
assert.equal(run('FINANCIAL_REPORTS.length'),9);
assert.equal(run("DOCTORS.filter(d=>d.practices.some(p=>p.branch==='pharmacy-swieqi')).length"),29);
assert.ok(goto('services').includes('Explore our services.'));
assert.ok(!goto('services').includes('Search all services'));
assert.ok(goto('service?id=oral-microbiome').includes('Start with a home sampling kit'));
assert.ok(!goto('service?id=gut-microbiome').includes('Travel time preview'));
assert.ok(goto('book?service=oral-microbiome').includes('do not need to choose a pharmacy appointment'));
assert.ok(goto('service?id=onda-pro').includes('BMI assessment'));
assert.ok(goto('service?id=schwarzy').includes('30–45 minutes'));
assert.ok(goto('service?id=skin-rejuvenation').includes('RED TOUCH PRO'));
assert.ok(goto('service?id=allergy-test').includes('€65'));
assert.ok(goto('service?id=laser-hair-removal').includes('2142 2999'));

assert.ok(goto('pharmacy?id=pharmacy-swieqi').includes('29 visiting practitioners'));
assert.ok(goto('doctors?specialty=Family%20Medicine').includes('View doctor'));
assert.ok(!goto('architecture').includes('Reference basis'));
assert.ok(goto('help?q=multiple').includes('Can I purchase multiple services together?'));
assert.ok(goto('investor?topic=announcements&q=BRW42').includes('BRW42'));
function click(action,data={}){const target={dataset:{action,...data},setAttribute(){},closest(selector){return selector==='[data-action]'?this:null;}};for(const fn of listeners.document.click||[])fn({target,preventDefault(){}});}
run("appointmentDrafts=[];bookingDone=null;booking={service:'',variant:'',location:'',preferredLocation:'',doctor:'',date:'',time:'',details:{},step:1};");
goto('book?demo=1&step=4');click('visit-add');assert.equal(run('appointmentDrafts.length'),1);assert.equal(run('booking.step'),1);
submit('booking',{service:'allergy-test'});submit('booking',{variant:'Standard test',location:'qormi'});submit('booking',{date:run('futureDates()[2]'),time:'14:00'});
submit('booking',{firstName:'Example',lastName:'Customer',email:'example@example.test',phone:'00000000',consent:'on'});
assert.equal(run('bookingDone.appointments.length'),2);assert.notEqual(run('bookingDone.appointments[0].date'),run('bookingDone.appointments[1].date'));assert.equal(run('appointmentDrafts.length'),0);
goto('account?tab=appointments');click('account-reschedule',{index:'1'});assert.ok(node('booking-dialog').innerHTML.includes('New date'));run('closeDialog()');
click('account-cancel',{index:'1'});assert.ok(node('booking-dialog').innerHTML.includes('Confirm example cancellation'));click('account-cancel-confirm',{index:'1'});assert.ok(run('cancelledAppointments.has(1)'));
goto('account?tab=payments');click('account-payment');assert.ok(node('booking-dialog').innerHTML.includes('No card details'));run('closeDialog()');
goto('register');submit('account-auth',{name:'Example',email:'example@example.test',password:'PreviewOnly123',terms:'on'});assert.equal(run('active'),'account');
goto('password-reset');submit('account-auth',{email:'example@example.test'});assert.ok(node('booking-dialog').innerHTML.includes('No email was sent'));run('closeDialog()');
run("userPosition={lat:35.89465187357196,lng:14.491184177212961}");assert.ok(run("distanceTo(branch('pieta'))<0.001"));goto('pharmacies?service=allergy-test');assert.ok(node('app').innerHTML.includes('nearest first'));assert.ok(!node('app').innerHTML.includes('href=\"#pharmacy?id=pieta\"'));run('userPosition=null');
// Conflicting example visits cannot be confirmed; selections remain available to fix.
run("bookingDone=null;appointmentDrafts=[]");goto('book?demo=1&step=4');click('visit-add');goto('book?demo=1&step=4');run('completeBooking()');assert.equal(run('bookingDone'),null);assert.ok(node('toast').textContent.includes('same date and time'));click('visit-remove',{index:'0'});run('completeBooking()');assert.equal(run('bookingDone.appointments.length'),1);
assert.ok(![...storage.values()].join('').includes('PreviewOnly123'),'Credentials are never persisted');

// Pagination must retain filters and stay compact at both boundaries and in the middle.
let paging=goto('doctors?q=Dr&page=3');
assert.ok(paging.includes('q=Dr&amp;page=2'), 'Previous page retains the search query');
assert.ok(paging.includes('aria-current="page"'), 'Current page is announced');
assert.ok(paging.includes('page-gap'), 'Long directories collapse distant pages');
assert.ok((paging.match(/class="page-number"/g)||[]).length<=5, 'At most five numbered links');
paging=goto('doctors?page=1');assert.ok(paging.includes('aria-disabled="true">← Previous'));
paging=goto('doctors?page=999');assert.ok(paging.includes('aria-disabled="true">Next →'));
goto('doctors?page=2.5');assert.equal(run('paginate(DOCTORS).label'),'13–24 of 152');
// Image comparison preserves uploads and supports both range keys and direct dragging.
const comparison=goto('beauty-results?treatment=laser-hair-removal');
assert.ok(comparison.includes('data-wf-image="results.laser-hair-removal.before"'));
assert.ok(comparison.includes('data-wf-image="results.laser-hair-removal.after"'));
assert.ok(comparison.includes('type="range"'));
run("globalThis.sliderTest={value:'75',closest(){return {style:{setProperty(k,v){globalThis.clipValue=v}}}},setAttribute(k,v){globalThis.sliderDescription=v}};updateComparison(sliderTest)");
assert.equal(run('clipValue'),'75%');assert.equal(run('sliderDescription'),'75% before image revealed');
run("moveComparison({clientX:150},{getBoundingClientRect(){return {left:100,width:200}},closest(){return {querySelector(){return sliderTest}}}})");assert.equal(run('clipValue'),'25%');
// Service discovery is direct by default; the category filter is optional.
const finder=goto('home');
assert.ok(finder.includes('Health or Beauty'));
assert.ok(!finder.includes('Health or Beauty (optional)'));
assert.ok(!run('header()').includes('Health or Beauty'));

assert.ok(finder.includes('<option value="" selected>Select</option>'));
submit('finder',{category:'',service:'onda-pro'});
assert.equal(run('params.get("id")'),'onda-pro');
const servicePicker={value:'onda-pro',innerHTML:''};
const categoryTarget={dataset:{change:'finder-category'},value:'health',form:{dataset:{form:'finder'},elements:{service:servicePicker}}};
function changeFinder(value){categoryTarget.value=value;for(const fn of listeners.document.change||[])fn({target:categoryTarget});}
changeFinder('health');assert.ok(servicePicker.innerHTML.includes('Health Check'));assert.ok(!servicePicker.innerHTML.includes('ONDA PRO'));assert.equal(servicePicker.value,'');
changeFinder('beauty');assert.ok(servicePicker.innerHTML.includes('ONDA PRO'));assert.ok(!servicePicker.innerHTML.includes('Health Check'));
servicePicker.value='onda-pro';changeFinder('');assert.ok(servicePicker.innerHTML.includes('Health Check'));assert.ok(servicePicker.innerHTML.includes('ONDA PRO'));assert.equal(servicePicker.value,'onda-pro');

// Removed travel-time preview does not reappear in the pharmacy directory.
assert.ok(!goto('pharmacies').includes('Travel time preview'));

// Shop filters intersect, keep their context, and reset pagination after a new search.
const cards=body=>[...body.matchAll(/data-product="([^"]+)"/g)].map(m=>m[1]);
assert.equal(run('INVENTORY_CATEGORIES.length'),41);
assert.equal(run('new Set(INVENTORY_CATEGORIES.map(c=>c.code)).size'),41);
assert.ok(run("['33','36','60'].every(code=>!SHOP_CATEGORIES.some(c=>c.code===code))"));
assert.deepEqual(cards(goto('catalogue?category=22&brand=Phyris&max=25')),['phyris-cleanser']);
assert.deepEqual(cards(goto('catalogue?category=22&brand=Phyris&min=21&max=32&sort=price-low')),['phyris-cleanser','phyris']);
assert.deepEqual(cards(goto('catalogue?category=22&brand=Phyris&min=21&max=32&sort=price-high')),['phyris','phyris-cleanser']);
assert.ok(goto('catalogue?min=50&max=10').includes('Check your price range'));
assert.ok(goto('category?id=1').includes('Products for this category have not yet been supplied'));
assert.ok(goto('category?id=60').includes('could not be found'));
assert.ok(goto('categories?q=gastrointestinal').includes('1 categories'));
assert.deepEqual(cards(goto('brand?name=Phyris&category=22&max=25')),['phyris-cleanser']);
assert.ok(node('app').innerHTML.includes('href="#brand?name=Phyris"'));
assert.deepEqual(cards(goto('category?id=22&brand=Phyris&min=30')),['phyris']);
assert.ok(node('app').innerHTML.includes('href="#category?id=22"'));
const firstPage=cards(goto('catalogue?sort=price-low'));
const secondPage=cards(goto('catalogue?sort=price-low&page=2'));
assert.equal(firstPage.length,12);assert.equal(secondPage.length,6);assert.ok(secondPage.every(id=>!firstPage.includes(id)));
submit('catalogue-filter',{q:'',category:'22',brand:'Phyris',min:'',max:'25',sort:'price-low'});
assert.equal(run('active'),'catalogue');assert.equal(run('params.has("page")'),false);assert.deepEqual(cards(node('app').innerHTML),['phyris-cleanser']);

// Checkbox facets OR within each group and AND between category / brand / price.
assert.deepEqual(cards(goto('catalogue?category=22&category=23&brand=Phyris&brand=Artdeco&max=25&sort=price-low')),['artdeco','phyris-cleanser','artdeco-face']);
const facetBody=node('app').innerHTML;
assert.ok(facetBody.includes('aria-label="Remove Phyris"'));
const removePhyris=decode(facetBody.match(/href="#([^"<>]+)" aria-label="Remove Phyris"/)[1]);
assert.deepEqual(cards(goto(removePhyris)),['artdeco','artdeco-face']);
submit('catalogue-filter',[['category','22'],['category','23'],['brand','Phyris'],['brand','Artdeco'],['max','25'],['sort','price-low']]);
assert.equal(run('params.getAll("category").length'),2);assert.equal(run('params.getAll("brand").length'),2);
assert.deepEqual(cards(node('app').innerHTML),['artdeco','phyris-cleanser','artdeco-face']);
assert.ok(node('app').innerHTML.includes('data-price-bound="min"'));
assert.ok(node('app').innerHTML.includes('data-price-bound="max"'));

const keys=[...run('observedKeys')].sort();
assert.ok(keys.every(k=>/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(k)),'Content keys must satisfy editor validation');
if(writeFields){await writeFile(snapshotUrl,html.replace(/const EDITABLE_FIELDS=\[[^;]*\];/,'const EDITABLE_FIELDS='+JSON.stringify(keys)+';'));console.log(`Registered ${keys.length} stable editable fields.`);}
console.log(`Checked ${seen.size} routes, ${pages.length} screen entries, booking and checkout logic, contextual selection, failure recovery and editable fields.`);
if(process.argv.includes('--export-render-audit'))await writeFile(new URL('../.wireframe/render-audit.json',import.meta.url),JSON.stringify(renders));
