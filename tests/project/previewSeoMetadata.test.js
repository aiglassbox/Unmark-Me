import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readText(relativePath) {
    return readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

test('public root page should stay noindex', async () => {
    const html = await readText('public/index.html');

    assert.match(html, /<meta\s+name="robots"\s+content="[^"]*noindex[^"]*nofollow[^"]*"/i);
});

test('public root page should point users to the preview app and userscript', async () => {
    const html = await readText('public/index.html');

    assert.match(html, /href="userscript\/gemini-watermark-remover\.user\.js"/i);
    assert.match(html, /href="\.\/dev-preview\.html"|href="dev-preview\.html"/i);
});

test('internal dev preview page should retain the browser preview app entry', async () => {
    const html = await readText('public/dev-preview.html');

    assert.match(html, /id="uploadArea"/i);
    assert.match(html, /id="comparisonContainer"/i);
    assert.match(html, /<script\s+src="app\.js"><\/script>/i);
});

test('internal dev preview page should not depend on external Tailwind CDN', async () => {
    const html = await readText('public/dev-preview.html');

    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/i);
    assert.doesNotMatch(html, /\btailwind\.config\b/i);
    assert.match(html, /href="dev-preview\.css"/i);
});

test('internal dev preview page should support multi-file image batches without old zip download UI', async () => {
    const html = await readText('public/dev-preview.html');

    assert.match(html, /<input[^>]+id="fileInput"[^>]+\bmultiple\b/i);
    assert.match(html, /id="multiPreview"/i);
    assert.match(html, /id="imageList"/i);
    assert.match(html, /id="progressText"/i);
    assert.doesNotMatch(html, /id="downloadAllBtn"/i);
});

test('internal dev preview page should not expose a language switch or html i18n hooks', async () => {
    const html = await readText('public/dev-preview.html');

    assert.doesNotMatch(html, /id="langSwitch"/i);
    assert.doesNotMatch(html, /data-i18n="/i);
    assert.doesNotMatch(html, /\bdark:/i);
});
