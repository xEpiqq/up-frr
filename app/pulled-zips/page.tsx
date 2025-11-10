'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function PulledZipsPage() {
  const [contacts, setContacts] = useState<{ id: string; label: string }[] | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [clientContactId, setClientContactId] = useState('');
  const [zip, setZip] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created?: number; exists?: boolean } | null>(null);
  const [contactQuery, setContactQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        setLoadingContacts(true);
        const res = await fetch('/api/contacts', { method: 'GET' });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Failed to load contacts');
        if (mounted) setContacts(json.contacts || []);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load contacts');
      } finally {
        if (mounted) setLoadingContacts(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!clientContactId) {
      setError('Please select a Contact.');
      return;
    }
    if (!zip) {
      setError('Please enter a ZIP.');
      return;
    }
    try {
      const res = await fetch('/api/pulled-zips', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ client_contact_id: clientContactId, zip })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || 'Failed to add ZIP');
      } else {
        setResult(json);
      }
    } catch (e: any) {
      setError(e?.message || 'Unexpected error');
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 rounded-lg bg-white p-8 shadow-sm dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Add to Pulled Zips</h1>
          <Link href="/" className="text-sm text-zinc-600 hover:underline dark:text-zinc-300">← Back to Upload</Link>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 relative">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Contact</span>
              <input
                type="text"
                placeholder={loadingContacts ? 'Loading…' : 'Search contacts'}
                value={contactQuery}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
              />
              {dropdownOpen && (
                <div
                  className="absolute bottom-full left-0 right-0 mb-2 max-h-60 overflow-auto rounded-md border border-zinc-300 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800 z-10"
                  onMouseLeave={() => setDropdownOpen(false)}
                >
                  {(contacts || [])
                    .filter(c => c.label.toLowerCase().includes(contactQuery.toLowerCase()))
                    .slice(0, 200)
                    .map(c => (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => {
                          setClientContactId(c.id);
                          setContactQuery(c.label);
                          setDropdownOpen(false);
                        }}
                        className={`block w-full cursor-pointer px-3 py-2 text-left hover:bg-zinc-100 dark:hover:bg-zinc-700 ${clientContactId === c.id ? 'bg-zinc-100 dark:bg-zinc-700' : ''}`}
                      >
                        {c.label}
                      </button>
                    ))}
                  {(contacts && (contacts.filter(c => c.label.toLowerCase().includes(contactQuery.toLowerCase())).length === 0)) && (
                    <div className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-300">No results</div>
                  )}
                </div>
              )}
              {clientContactId && (
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Selected ID: {clientContactId}</div>
              )}
            </label>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Location</span>
              <div className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50">
                Jayden
              </div>
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ZIP</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="\\d{5}(-\\d{4})?"
              placeholder="e.g. 90210 or 90210-1234"
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
            />
          </label>
          <button
            type="submit"
            className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
          >
            Add ZIP
          </button>
        </form>
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
            {error}
          </div>
        )}
        {result && (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
            {result.exists ? 'ZIP already exists for this contact and location.' : 'ZIP added.'}
          </div>
        )}
      </main>
    </div>
  );
}


