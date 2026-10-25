export function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="inline-flex rounded-lg bg-brand-teal/10 p-2 text-brand-teal">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-brand-ink">{value}</p>
      <p className="text-sm text-brand-gray">{label}</p>
    </div>
  );
}
