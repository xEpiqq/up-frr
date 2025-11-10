'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Login() {
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setLoading(true);
		try {
			const res = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password })
			});
			if (!res.ok) {
				const j = await res.json().catch(() => ({}));
				setError(j?.error || 'Invalid password');
				return;
			}
			router.replace('/');
		} catch (err: any) {
			setError(err?.message || 'Unexpected error');
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-zinc-50 font-sans dark:bg-black">
			<main className="flex w-full max-w-sm flex-col gap-6 rounded-lg bg-white p-6 shadow-sm dark:bg-zinc-900">
				<h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Enter Password</h1>
				<form onSubmit={onSubmit} className="flex flex-col gap-4">
					<input
						type="password"
						placeholder="Password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none focus:ring-2 focus:ring-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50"
					/>
					<button
						type="submit"
						disabled={loading}
						className="inline-flex items-center justify-center rounded-md bg-black px-4 py-2 text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-white"
					>
						{loading ? 'Checking…' : 'Enter'}
					</button>
				</form>
				{error && (
					<div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100">
						{error}
					</div>
				)}
			</main>
		</div>
	);
}


