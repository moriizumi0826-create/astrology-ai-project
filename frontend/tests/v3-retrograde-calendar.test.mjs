import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseRetrogradeCalendar,localRetrogradeCalendar} from '../v3/retrograde-calendar-data.mjs';
const source=readFileSync(new URL('../../database/M_Retrograde_Calendar.generated.csv',import.meta.url),'utf8');
test('all actual master rows survive, including dates before today and far future',()=>{
 const events=parseRetrogradeCalendar(source),local=localRetrogradeCalendar(events,'Asia/Tokyo');
 assert.equal(events.length,91);assert.equal(local.length,events.length);
 assert.equal(local[0].event_date,'2026-06-30');assert.equal(local.at(-1).event_date,'2031-04-18');
 assert.equal(local.filter(e=>e.event_date<'2026-10-20').length,7);
 for(const event of local)assert.ok(['逆行開始','順行開始'].includes(event.event_label));
});
test('CSV parsing handles quoted commas and doubled quotes without changing fields',()=>{
 const csv='Planet,Event_Type,Event_Date,Event_DateTime_JST,Planet_Label,Source_Note\r\nMERCURY,RETROGRADE_START,2026-01-01,2026-01-01 01:00:00,水星,"quoted, ""text"""\r\n';
 const events=parseRetrogradeCalendar(csv);assert.equal(events.length,1);assert.equal(events[0].planet_label,'水星');
 const localized=localRetrogradeCalendar(events,'America/Los_Angeles');
 assert.equal(localized[0].event_date,'2025-12-31');assert.equal(events[0].event_date,'2026-01-01');
});
test('incomplete or malformed masters fail the build rather than silently hiding rows',()=>{
 assert.throws(()=>parseRetrogradeCalendar('Planet\nMERCURY'));
 assert.throws(()=>parseRetrogradeCalendar('Planet,Event_Type,Event_Date,Event_DateTime_JST\nMERCURY,OTHER,2026-01-01,2026-01-01 01:00:00'));
 assert.throws(()=>parseRetrogradeCalendar('"unfinished'));
});
