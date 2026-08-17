import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-lg font-semibold">Quest not found.</p>
      <p className="text-sm text-muted">
        This path doesn&apos;t lead anywhere yet.
      </p>
      <Link
        href="/dashboard"
        className="inline-flex h-11 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground hover:bg-primary/90"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
