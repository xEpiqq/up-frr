'use client';
import { useState } from "react";
import { useEffect } from "react";

export default function Home() {
	const [clientContactId, setClientContactId] = useState("");
	const [file, setFile] = useState<File | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [result, setResult] = useState<any>(null);
	const [error, setError] = useState<string | null>(null);
	const [contacts, setContacts] = useState<{ id: string; label: string }[] | null>(null);
	const [loadingContacts, setLoadingContacts] = useState(false);
	const [contactQuery, setContactQuery] = useState("");
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const FIXED_LOCATION_ID = 'Ypfq5TDjEbkz5WdFRLgt';
	const [pulledZip, setPulledZip] = useState("");

	useEffect(() => {
		let mounted = true;
		async function load() {
			try {
				setLoadingContacts(true);
				const res = await fetch('/api/contacts', { method: 'GET' });
				const json = await res.json();
				if (!res.ok) {
					throw new Error(json?.error || 'Failed to load contacts');
				}
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

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setResult(null);
		if (!file) {
			setError("Please choose a CSV file.");
			return;
		}
		if (!clientContactId) {
			setError("Please select a Contact.");
			return;
		}
		try {
			setIsUploading(true);
			const formData = new FormData();
			formData.append('file', file);
			formData.append('client_contact_id', clientContactId);
			formData.append('location_id', FIXED_LOCATION_ID);
			if (pulledZip) formData.append('pulled_zip', pulledZip);
			const res = await fetch('/api/upload', {
				method: 'POST',
				body: formData
			});
			const json = await res.json();
			if (!res.ok) {
				setError(json?.error || 'Upload failed');
			} else {
				setResult(json);
			}
		} catch (err: any) {
			setError(err?.message || 'Unexpected error');
		} finally {
			setIsUploading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
			<main className="flex w-full max-w-3xl flex-col gap-8 rounded-lg bg-white p-8 shadow-sm dark:bg-zinc-900">
				<h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">CSV Uploader</h1>
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
							{/* Upward-opening dropdown */}
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
						<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ZIP for pulled_zips (optional)</span>
						<input
							type="text"
							inputMode="numeric"
							pattern="\\d{5}(-\\d{4})?"
							placeholder="e.g. 90210 or 90210-1234"
							value={pulledZip}
							onChange={(e) => setPulledZip(e.target.value)}
							className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
						/>
					</label>
					<label className="flex flex-col gap-2">
						<span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">CSV File</span>
						<input
							type="file"
							accept=".csv,text/csv"
							onChange={(e) => setFile(e.target.files?.[0] || null)}
							className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 file:mr-4 file:rounded-md file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:file:bg-zinc-700"
						/>
					</label>
					<button
						type="submit"
						disabled={isUploading}
						className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
					>
						{isUploading ? 'Uploading…' : 'Upload'}
					</button>
				</form>
				{error && (
					<div className="rounded-md border border-red-300 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
						{error}
					</div>
				)}
				{result?.summary && (
					<div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100">
						<h2 className="mb-2 text-base font-semibold">Summary</h2>
						<ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
							<li>Read from CSV: <strong>{result.summary.read_from_csv}</strong></li>
							<li>Kept after clean: <strong>{result.summary.kept_after_clean}</strong></li>
							<li>Duplicates skipped (DB): <strong>{result.summary.duplicates_skipped_db}</strong></li>
							<li>Attempted to insert: <strong>{result.summary.attempted_to_insert}</strong></li>
							<li>Inserted successfully: <strong>{result.summary.inserted_successfully}</strong></li>
							<li>Failed inserts: <strong>{result.summary.failed_inserts}</strong></li>
						</ul>
						{result.errors?.length ? (
							<div className="mt-3">
								<div className="mb-1 font-medium">Sample errors:</div>
								<ul className="list-disc pl-6">
									{result.errors.map((e: any, idx: number) => (
										<li key={idx} className="break-words">
											batchStart={e.batchStart} :: {e.message}
										</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				)}
			</main>
		</div>
	);
}
