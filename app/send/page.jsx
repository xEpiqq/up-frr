'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC (anon) Supabase client – used only for reading tags & pulled_zips
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://upxztevetixqwlzpnjfv.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVweHp0ZXZldGl4cXdsenBuamZ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk0OTI1MjQsImV4cCI6MjA3NTA2ODUyNH0.I-geY9rd_7vcqhsktT2pUeo9-tnA-087ic3W1Qtw-Sw';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default function SendPage() {
  const [zips, setZips] = useState([]);
  const [zipQuery, setZipQuery] = useState('');
  const [zipOpen, setZipOpen] = useState(false);
  const [selectedZip, setSelectedZip] = useState('');

  const [tags, setTags] = useState([]);
  const [tagQuery, setTagQuery] = useState('');
  const [tagOpen, setTagOpen] = useState(false);
  const [selectedTag, setSelectedTag] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  const [amount, setAmount] = useState('100');

  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);

  const [progress, setProgress] = useState({
    attempted: 0,
    succeeded: 0,
    failed: 0,
    dedupeSkipped: 0
  });
  const [lastChunk, setLastChunk] = useState(null);
  const [error, setError] = useState(null);

  // Load pulled ZIPs & tags
  const loadZips = useCallback(async () => {
    const { data, error } = await supabase
      .from('pulled_zips')
      .select('zip')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    const unique = Array.from(new Set((data || []).map((r) => String(r.zip || '').trim()).filter(Boolean)));
    unique.sort();
    setZips(unique);
  }, []);

  const loadTags = useCallback(async () => {
    const { data } = await supabase.from('tags').select('id, tag').order('tag', { ascending: true });
    setTags((data || []).map((r) => String(r.tag || '')).filter(Boolean));
  }, []);

  useEffect(() => {
    loadZips().catch((e) => setError(e?.message || String(e)));
    loadTags().catch(() => {});
  }, [loadZips, loadTags]);

  const filteredZips = useMemo(() => {
    if (!zipQuery.trim()) return zips.slice(0, 300);
    return zips.filter((z) => z.toLowerCase().includes(zipQuery.toLowerCase())).slice(0, 300);
  }, [zips, zipQuery]);

  const filteredTags = useMemo(() => {
    if (!tagQuery.trim()) return tags.slice(0, 300);
    return tags.filter((t) => t.toLowerCase().includes(tagQuery.toLowerCase())).slice(0, 300);
  }, [tags, tagQuery]);

  async function handleAddTag() {
    const name = newTagName.trim();
    if (!name) return;
    setAddingTag(true);
    try {
      const { data, error } = await supabase
        .from('tags')
        .insert({ tag: name })
        .select('id, tag')
        .single();
      if (error) throw error;
      const t = String(data.tag || '');
      setTags((prev) => Array.from(new Set([...prev, t])).sort());
      setSelectedTag(t);
      setNewTagName('');
      setTagOpen(false);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setAddingTag(false);
    }
  }

  // Client-driven chunked upload loop (25 per call)
  async function runUpload() {
    setError(null);
    setRunning(true);
    setCancelled(false);
    cancelRef.current = false;
    setProgress({ attempted: 0, succeeded: 0, failed: 0, dedupeSkipped: 0 });
    setLastChunk(null);

    try {
      const wanted = Math.max(1, Math.min(500, parseInt((amount || '0').trim(), 10) || 0));
      const batchSize = 25; // ← per your request
      let remaining = wanted;

      while (remaining > 0) {
        if (cancelRef.current) break;

        const thisBatch = Math.min(batchSize, remaining);
        const res = await fetch('/api/send', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            zip: selectedZip.trim(),
            tag: selectedTag.trim() || null,
            amount: thisBatch
          })
        });

        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error || 'Upload chunk failed');

        setProgress((prev) => ({
          attempted: prev.attempted + (json.attempted ?? 0),
          succeeded: prev.succeeded + (json.succeeded ?? 0),
          failed: prev.failed + (json.failed ?? 0),
          dedupeSkipped: prev.dedupeSkipped + (json.dedupeSkipped ?? 0)
        }));
        setLastChunk(json);

        remaining -= thisBatch;

        // brief yield to UI
        await new Promise((r) => setTimeout(r, 120));
      }
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  }

  const canStart = useMemo(() => {
    const a = parseInt((amount || '0').trim(), 10);
    return selectedZip && !running && Number.isFinite(a) && a > 0;
  }, [selectedZip, amount, running]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 rounded-lg bg-white p-8 shadow-sm dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Send Contacts (Web)</h1>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* ZIP picker */}
          <label className="flex flex-col gap-2 relative">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ZIP *</span>
            <input
              type="text"
              placeholder="Search or type ZIP"
              value={selectedZip ? selectedZip : zipQuery}
              onChange={(e) => {
                setSelectedZip('');
                setZipQuery(e.target.value);
                setZipOpen(true);
              }}
              onFocus={() => setZipOpen(true)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
            {zipOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-auto rounded-md border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800 z-10"
                onMouseLeave={() => setZipOpen(false)}
              >
                {filteredZips.map((z) => (
                  <button
                    type="button"
                    key={z}
                    onClick={() => {
                      setSelectedZip(z);
                      setZipQuery('');
                      setZipOpen(false);
                    }}
                    className={`block w-full cursor-pointer px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                      selectedZip === z ? 'bg-zinc-100 dark:bg-zinc-700' : ''
                    }`}
                  >
                    {z}
                  </button>
                ))}
                {filteredZips.length === 0 && (
                  <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-300">No results</div>
                )}
              </div>
            )}
            {selectedZip && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Selected: {selectedZip}</div>
            )}
          </label>

          {/* Tag picker / create */}
          <label className="flex flex-col gap-2 relative">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Tag (optional)</span>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Search or select a tag"
                value={selectedTag ? selectedTag : tagQuery}
                onChange={(e) => {
                  setSelectedTag('');
                  setTagQuery(e.target.value);
                  setTagOpen(true);
                }}
                onFocus={() => setTagOpen(true)}
                className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
              <button
                type="button"
                onClick={() => setTagOpen((v) => !v)}
                className="rounded-md border border-zinc-300 bg-zinc-100 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              >
                {tagOpen ? 'Close' : 'Browse'}
              </button>
            </div>

            {tagOpen && (
              <div
                className="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-auto rounded-md border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800 z-10"
                onMouseLeave={() => setTagOpen(false)}
              >
                {filteredTags.map((t) => (
                  <button
                    type="button"
                    key={t}
                    onClick={() => {
                      setSelectedTag(t);
                      setTagQuery('');
                      setTagOpen(false);
                    }}
                    className={`block w-full cursor-pointer px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 ${
                      selectedTag === t ? 'bg-zinc-100 dark:bg-zinc-700' : ''
                    }`}
                  >
                    {t}
                  </button>
                ))}

                {/* Inline creator */}
                <div className="border-t border-zinc-200 p-3 dark:border-zinc-700">
                  <div className="text-xs mb-2 text-zinc-600 dark:text-zinc-300">Create new tag</div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New tag"
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
                    />
                    <button
                      type="button"
                      disabled={!newTagName.trim() || addingTag}
                      onClick={handleAddTag}
                      className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
                    >
                      {addingTag ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {selectedTag && (
              <div className="text-xs text-zinc-500 dark:text-zinc-400">Selected: {selectedTag}</div>
            )}
          </label>
        </div>

        {/* Amount */}
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Amount * (max 500)</span>
          <input
            type="number"
            min={1}
            max={500}
            placeholder="e.g. 100"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-48 rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
          />
        </label>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={!canStart}
            onClick={runUpload}
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
          >
            {running ? 'Running…' : 'Start Upload'}
          </button>

          <button
            type="button"
            disabled={!running}
            onClick={() => {
              setCancelled(true);
              cancelRef.current = true;
            }}
            className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-4 py-2 text-zinc-900 hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700"
          >
            Cancel
          </button>
        </div>

        {/* Progress */}
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
          <div className="mb-2 font-semibold">Progress</div>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <li>Attempted: <strong>{progress.attempted}</strong></li>
            <li>Succeeded: <strong>{progress.succeeded}</strong></li>
            <li>Failed: <strong>{progress.failed}</strong></li>
            <li>In-run dedupe skipped: <strong>{progress.dedupeSkipped}</strong></li>
          </ul>
          {lastChunk?.duration_ms != null && (
            <div className="mt-2 text-xs opacity-75">
              Last chunk duration: {(lastChunk.duration_ms / 1000).toFixed(2)}s · Rate limit: {lastChunk.rate_limit_rps}/s · Per-call cap: {lastChunk.call_cap}
            </div>
          )}
          {cancelled && (
            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              Cancel requested — finishing current batch…
            </div>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}
