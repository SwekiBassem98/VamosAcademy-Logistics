export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Chargement">
      <div className="mb-6 h-8 w-64 rounded bg-gray-200" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-lg bg-gray-200" />)}
      </div>
      <div className="mt-6 h-72 rounded-lg bg-gray-200" />
      <span className="sr-only">Chargement…</span>
    </div>
  );
}
