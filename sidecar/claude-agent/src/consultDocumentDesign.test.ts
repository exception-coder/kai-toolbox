import test from 'node:test'
import assert from 'node:assert/strict'
import { executeDocumentDesign } from './consultDocumentDesign.js'

test('model code transforms data and freely composes document layout', async () => {
  const result = await executeDocumentDesign(`return {format:'pptx', title:'采购汇报', layout:{pages:[{
    background:'10263D', elements:data.values.map((v,i)=>({kind:'rect',x:80+i*120,y:300-v,w:80,h:v,fill:'4F9C85'}))
  }]}}`, { values: [20, 60, 100] })
  assert.equal(result.format, 'pptx')
  assert.equal((result.layout as any).pages[0].elements[2].h, 100)
})

test('guest cannot reach host filesystem, credentials, network or dynamic Node imports', async () => {
  for (const script of ["return process.env", "return require('node:fs').readFileSync('secret')", "return fetch('https://example.com')",
    "return ({}).constructor.constructor('return process')().env", "return std.loadFile('secret')", "return {date:Date.now()}", "return {random:Math.random()}"]) {
    await assert.rejects(executeDocumentDesign(script, {}), /执行失败/)
  }
})

test('bounds simultaneous workers and error messages', async () => {
  const first = executeDocumentDesign('return {ok:true}', {})
  const second = executeDocumentDesign('return {ok:true}', {})
  await assert.rejects(executeDocumentDesign('return {ok:true}', {}), /正在忙/)
  await Promise.all([first, second])
  await assert.rejects(executeDocumentDesign("throw Error('x'.repeat(100000))", {}), (error: Error) => error.message.length < 2100)
})

test('infinite loops and memory exhaustion are bounded and next execution still succeeds', async () => {
  await assert.rejects(executeDocumentDesign('while(true){}', {}), /执行失败|超时/)
  await assert.rejects(executeDocumentDesign("const a=[];while(true)a.push('x'.repeat(100000));", {}), /执行失败|超时/)
  assert.deepEqual(await executeDocumentDesign('return {ok:true}', {}), { ok: true })
})

test('rejects oversized code, output and non-object results', async () => {
  await assert.rejects(executeDocumentDesign('x'.repeat(50_001), {}), /50000/)
  await assert.rejects(executeDocumentDesign("return {x:'a'.repeat(300001)}", {}), /30万/)
  await assert.rejects(executeDocumentDesign('return 1', {}), /文档对象/)
})

test('Excel design output supports inventory exports without lifting other format limits', async () => {
  const result = await executeDocumentDesign("return {format:'xlsx',title:'库存',sheets:[{name:'库存',columns:['备注'],rows:Array.from({length:2218},()=>['说明'.repeat(80)])}]}", {})
  assert.equal((result.sheets as any[])[0].rows.length, 2218)
  assert.ok(JSON.stringify(result).length > 300000)
  await assert.rejects(executeDocumentDesign("return {format:'xlsx',x:'a'.repeat(1000001)}", {}), /100万/)
})
