import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePresentation, wrapPresentation, type AgentPresentation } from './presentation.js';

test('parsePresentation extracts valid fenced JSON presentation', () => {
  const reply = '```json\n{"data":"value","presentation":{"title":"Report","summary":"Summary text","html":"<div>content</div>"}}\n```';
  const result = parsePresentation(reply);
  assert.deepEqual(result.presentation, { title: 'Report', summary: 'Summary text', html: '<div>content</div>' });
  assert.equal(result.dataReply, '{"data":"value"}');
});

test('parsePresentation returns original reply if no presentation field', () => {
  const reply = 'text\n```json\n{"data":"value"}\n```';
  const result = parsePresentation(reply);
  assert.equal(result.dataReply, reply);
  assert.equal(result.presentation, undefined);
});

test('parsePresentation returns original reply if not JSON', () => {
  const reply = 'plain text response';
  const result = parsePresentation(reply);
  assert.equal(result.dataReply, reply);
  assert.equal(result.presentation, undefined);
});

test('parsePresentation extracts plain JSON without requiring fences', () => {
  const reply = '{"data":"value","presentation":{"title":"t","summary":"s","html":"h"}}';
  const result = parsePresentation(reply);
  assert.equal(result.dataReply, '{"data":"value"}');
  assert.equal(result.presentation?.title, 't');
});

test('parsePresentation throws on malformed JSON in fence', () => {
  const reply = '```json\n{bad json}\n```';
  assert.throws(() => parsePresentation(reply), /invalid.*presentation|malformed/i);
});

test('parsePresentation throws on missing presentation title', () => {
  const reply = '```json\n{"presentation":{"summary":"s","html":"h"}}\n```';
  assert.throws(() => parsePresentation(reply), /title|required|invalid/i);
});

test('parsePresentation throws on empty title', () => {
  const reply = '```json\n{"presentation":{"title":"","summary":"s","html":"h"}}\n```';
  assert.throws(() => parsePresentation(reply), /title|empty|required|invalid/i);
});

test('parsePresentation throws on title over 200 chars', () => {
  const title = 'x'.repeat(201);
  const reply = `\`\`\`json\n{"presentation":{"title":"${title}","summary":"s","html":"h"}}\n\`\`\``;
  assert.throws(() => parsePresentation(reply), /title|limit|200|invalid/i);
});

test('parsePresentation throws on missing summary', () => {
  const reply = '```json\n{"presentation":{"title":"t","html":"h"}}\n```';
  assert.throws(() => parsePresentation(reply), /summary|required|invalid/i);
});

test('parsePresentation throws on empty summary', () => {
  const reply = '```json\n{"presentation":{"title":"t","summary":"","html":"h"}}\n```';
  assert.throws(() => parsePresentation(reply), /summary|empty|required|invalid/i);
});

test('parsePresentation throws on summary over 2000 chars', () => {
  const summary = 'x'.repeat(2001);
  const reply = `\`\`\`json\n{"presentation":{"title":"t","summary":"${summary}","html":"h"}}\n\`\`\``;
  assert.throws(() => parsePresentation(reply), /summary|limit|2000|invalid/i);
});

test('parsePresentation throws on missing html', () => {
  const reply = '```json\n{"presentation":{"title":"t","summary":"s"}}\n```';
  assert.throws(() => parsePresentation(reply), /html|required|invalid/i);
});

test('parsePresentation throws on empty html', () => {
  const reply = '```json\n{"presentation":{"title":"t","summary":"s","html":""}}\n```';
  assert.throws(() => parsePresentation(reply), /html|empty|required|invalid/i);
});

test('parsePresentation throws on html over 256KB', () => {
  const html = 'x'.repeat(256 * 1024 + 1);
  const reply = `\`\`\`json\n{"presentation":{"title":"t","summary":"s","html":"${html}"}}\n\`\`\``;
  assert.throws(() => parsePresentation(reply), /html|limit|256|invalid|size/i);
});

test('parsePresentation throws on non-string title', () => {
  const reply = '```json\n{"presentation":{"title":123,"summary":"s","html":"h"}}\n```';
  assert.throws(() => parsePresentation(reply), /title|type|string|invalid/i);
});

test('parsePresentation throws on non-string summary', () => {
  const reply = '```json\n{"presentation":{"title":"t","summary":true,"html":"h"}}\n```';
  assert.throws(() => parsePresentation(reply), /summary|type|string|invalid/i);
});

test('parsePresentation throws on non-string html', () => {
  const reply = '```json\n{"presentation":{"title":"t","summary":"s","html":["array"]}}\n```';
  assert.throws(() => parsePresentation(reply), /html|type|string|invalid/i);
});

test('parsePresentation preserves data fields outside presentation', () => {
  const reply = '```json\n{"field1":"value1","field2":42,"presentation":{"title":"t","summary":"s","html":"h"},"field3":true}\n```';
  const result = parsePresentation(reply);
  const data = JSON.parse(result.dataReply);
  assert.equal(data.field1, 'value1');
  assert.equal(data.field2, 42);
  assert.equal(data.field3, true);
  assert.equal(data.presentation, undefined);
});

test('parsePresentation handles non-object JSON gracefully', () => {
  const reply = '```json\n["array","data"]\n```';
  const result = parsePresentation(reply);
  assert.equal(result.dataReply, reply);
  assert.equal(result.presentation, undefined);
});

test('wrapPresentation creates self-contained HTML with outer CSP', () => {
  const html = '<div>content</div>';
  const title = 'Test Title';
  const wrapped = wrapPresentation(html, title);
  assert.ok(wrapped.includes('<!DOCTYPE html>'));
  assert.ok(wrapped.includes('Test Title'));
  assert.ok(wrapped.includes('<iframe'));
  assert.ok(wrapped.includes('sandbox="allow-scripts"'));
  assert.ok(wrapped.includes('default-src \'none\''));
  assert.ok(wrapped.includes('frame-src \'self\' data:'));
  assert.ok(wrapped.includes('srcdoc='));
});

test('wrapPresentation escapes title in outer document', () => {
  const html = '<div>test</div>';
  const title = '"><script>alert("xss")</script><div class="';
  const wrapped = wrapPresentation(html, title);
  assert.ok(!wrapped.includes('><script>'));
  assert.ok(wrapped.includes('&lt;') || wrapped.includes('&#'));
});

test('wrapPresentation escapes html in srcdoc', () => {
  const html = '"><script>alert("xss")</script>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  assert.ok(wrapped.includes('srcdoc='));
  const srcdocMatch = wrapped.match(/srcdoc="([^"]*)"/);
  assert.ok(srcdocMatch);
  assert.ok(!srcdocMatch![1].includes('><script>'));
});

test('wrapPresentation inner CSP before arbitrary html', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  const srcdocMatch = wrapped.match(/srcdoc="([^"]*)"/);
  assert.ok(srcdocMatch);
  const innerContent = srcdocMatch![1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const cspIndex = innerContent.indexOf('default-src \'none\'');
  const contentIndex = innerContent.indexOf('<div>');
  assert.ok(cspIndex !== -1);
  assert.ok(contentIndex !== -1);
  assert.ok(cspIndex < contentIndex);
});

test('wrapPresentation outer CSP before iframe', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  const cspOuterIndex = wrapped.indexOf('default-src \'none\'');
  const iframeIndex = wrapped.indexOf('<iframe');
  assert.ok(cspOuterIndex !== -1);
  assert.ok(iframeIndex !== -1);
  assert.ok(cspOuterIndex < iframeIndex);
});

test('wrapPresentation inner CSP forbids frame-src', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  const srcdocMatch = wrapped.match(/srcdoc="([^"]*)"/);
  assert.ok(srcdocMatch);
  const innerContent = srcdocMatch![1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  assert.ok(innerContent.includes("frame-src 'none'"));
});

test('wrapPresentation outer CSP allows frame-src self data:', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  assert.ok(wrapped.includes("frame-src 'self' data:"));
});

test('wrapPresentation iframe lacks allow-same-origin', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  const iframeMatch = wrapped.match(/<iframe[^>]*>/);
  assert.ok(iframeMatch);
  assert.ok(!iframeMatch![0].includes('allow-same-origin'));
});

test('wrapPresentation sets correct sandbox attribute', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  const iframeMatch = wrapped.match(/<iframe[^>]*>/);
  assert.ok(iframeMatch);
  assert.ok(iframeMatch![0].includes('sandbox="allow-scripts"'));
});

test('wrapPresentation supports HTML and SVG content', () => {
  const html = '<svg><circle cx="50" cy="50" r="40"/></svg><div>text</div>';
  const title = 'Mixed Content';
  const wrapped = wrapPresentation(html, title);
  const srcdocMatch = wrapped.match(/srcdoc="([^"]*)"/);
  assert.ok(srcdocMatch);
  assert.ok(srcdocMatch![1].includes('svg'));
});

test('wrapPresentation supports inline scripts', () => {
  const html = '<script>console.log("test");</script><div id="app"></div>';
  const title = 'With Script';
  const wrapped = wrapPresentation(html, title);
  const srcdocMatch = wrapped.match(/srcdoc="([^"]*)"/);
  assert.ok(srcdocMatch);
  assert.ok(srcdocMatch![1].includes('console.log'));
});

test('wrapPresentation no parent bridge or external scripts', () => {
  const html = '<div>content</div>';
  const title = 'Title';
  const wrapped = wrapPresentation(html, title);
  assert.ok(!wrapped.includes('window.parent'));
  assert.ok(!wrapped.includes('top.'));
  assert.ok(!wrapped.includes('postMessage'));
  const iframeMatch = wrapped.match(/<iframe[^>]*>/);
  assert.ok(iframeMatch);
  assert.ok(!iframeMatch![0].includes('onload'));
});

test('parsePresentation and wrapPresentation roundtrip', () => {
  const originalReply = '```json\n{"data":"result","presentation":{"title":"Analysis","summary":"Key findings","html":"<p>Details</p>"}}\n```';
  const { presentation, dataReply } = parsePresentation(originalReply);
  assert.ok(presentation);
  const wrapped = wrapPresentation(presentation.html, presentation.title);
  assert.ok(wrapped.includes('Analysis'));
  assert.ok(wrapped.includes('&lt;p&gt;Details&lt;/p&gt;'));
  const data = JSON.parse(dataReply);
  assert.equal(data.data, 'result');
  assert.equal(data.presentation, undefined);
});
