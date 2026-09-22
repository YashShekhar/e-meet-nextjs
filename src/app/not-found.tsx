import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-screen bg-[#080808] text-zinc-100 p-8 text-center">
      <div className="rounded-[24px] border border-white/10 bg-white/[0.04] p-8 max-w-md w-full">
        <p className="text-sm font-mono text-red-300">404 • Invalid room</p>
        <h2 className="mt-2 text-xl font-semibold">Room not found</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Room ID must be like <span className="font-mono text-white">A1B2CD-X9Y2</span> (6-4, A-Z 0-9). It may be expired — rooms are ephemeral and not stored.
        </p>
        <Link href="/" className="mt-6 inline-flex h-10 rounded-full bg-white text-black px-6 items-center justify-center text-sm font-medium hover:bg-zinc-200 transition">
          Go home
        </Link>
      </div>
      <p className="mt-6 text-xs text-zinc-500">Designed and Developed by Yash Shekhar</p>
    </div>
  );
}
