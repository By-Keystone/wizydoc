const colorMap = {
  blue: "bg-brand-teal/10 text-brand-teal",
  yellow: "bg-yellow-50 text-yellow-600",
  teal: "bg-teal-50 text-teal-600",
  purple: "bg-purple-50 text-purple-600",
};

export function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: keyof typeof colorMap;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className={`inline-flex rounded-lg p-2 ${colorMap[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-3 text-2xl font-bold text-brand-ink">{value}</p>
      <p className="text-sm text-brand-gray">{label}</p>
    </div>
  );
}
