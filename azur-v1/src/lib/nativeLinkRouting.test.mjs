import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAzurCompletionLink } from './nativeLinkRouting.mjs';
test('accepts approved dashboard and onboarding links',()=>{
 assert.equal(resolveAzurCompletionLink('https://azur-triathlon.vercel.app/'),'/');
 assert.equal(resolveAzurCompletionLink('https://azur-triathlon.vercel.app/onboarding'),'/onboarding');
});
test('accepts only explicit provider connection completion status',()=>{
 assert.equal(resolveAzurCompletionLink('https://azur-triathlon.vercel.app/?garmin=connected'),'/?garmin=connected');
 assert.equal(resolveAzurCompletionLink('https://azur-triathlon.vercel.app/?intervals=connected'),'/?intervals=connected');
});
test('rejects OAuth codes, token fragments, arbitrary query and malicious hosts',()=>{
 for(const url of [
  'https://azur-triathlon.vercel.app/?code=secret',
  'https://azur-triathlon.vercel.app/?garmin=connected&code=secret',
  'https://azur-triathlon.vercel.app/?intervals=connected#access_token=secret',
  'https://azur-triathlon.vercel.app.evil.com/?garmin=connected',
  'http://azur-triathlon.vercel.app/',
  'https://azur-triathlon.vercel.app/evil',
  'https://azur-triathlon.vercel.app/?garmin=failed'
 ]) assert.equal(resolveAzurCompletionLink(url),null,url);
});
