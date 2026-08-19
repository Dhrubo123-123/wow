export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">You&apos;re offline</p>
      <p className="text-sm text-muted">
        EMBER needs a connection for quests and AI features. Your progress
        is safe — reconnect and pick up where you left off.
      </p>
    </div>
  );
}
