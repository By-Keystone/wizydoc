import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  lg: "h-14 w-14 text-lg",
};

interface Props {
  name: string;
  lastName: string;
  size?: keyof typeof SIZES;
}

export function UserAvatar({ name, lastName, size = "sm" }: Props) {
  const initials = `${name.trim()[0] ?? ""}${lastName.trim()[0] ?? ""}`;

  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-brand-teal/10 font-bold uppercase text-brand-teal-dark",
        SIZES[size],
      )}
    >
      {initials}
    </span>
  );
}
