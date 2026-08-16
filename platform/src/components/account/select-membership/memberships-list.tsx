import type { Membership } from "@/lib/api/memberships";
import { EnterLink } from "./enter-link";

type Props = {
  memberships: Membership[];
};

export function MembershipsList({ memberships }: Props) {
  if (memberships.length === 0) {
    return (
      <div className="flex items-center justify-center">
        <p className="text-sm text-brand-gray">
          No perteneces a ninguna organización todavía.
        </p>
      </div>
    );
  }

  if (memberships.some((m) => m.accountId === null)) {
    return (
      <div className="flex items-center justify-center">
        <p className="text-sm text-red-500">
          Tu usuario no pertenece a ninguna cuenta
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-6">
      <h1 className="text-xl font-semibold text-brand-teal-dark">
        Selecciona un workspace
      </h1>
      {memberships.map((m) => (
        <details
          key={m.organization.resourceId}
          className="group rounded-2xl border border-gray-200 bg-white shadow-sm open:shadow-md"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between p-5 [&::-webkit-details-marker]:hidden">
            <div className="flex items-center gap-3">
              <svg
                className="h-4 w-4 text-brand-gray transition-transform group-open:rotate-90"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <h2 className="text-base font-semibold text-brand-teal-dark">
                  {m.organization.name}
                </h2>
                <p className="text-xs text-brand-gray">
                  {m.membership
                    ? `Tu rol: ${m.membership.role}`
                    : "Acceso por clínicas"}
                  <span className="ml-2 text-brand-gray">
                    · {m.clinics.length}{" "}
                    {m.clinics.length === 1 ? "clínica" : "clínicas"}
                  </span>
                </p>
              </div>
            </div>

            {m.membership && m.membership.role === "ADMIN" && (
              <EnterLink
                href={`/account/${m.accountId}/organization/${m.organization.resourceId}`}
                className="rounded-lg bg-brand-teal px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-teal-dark"
                resourceId={m.organization.resourceId}
                resourceType={"ORGANIZATION"}
              >
                Entrar
              </EnterLink>
            )}
          </summary>

          {m.clinics.length > 0 && (
            <ul className="flex flex-col divide-y divide-gray-100 border-t border-gray-100 px-5 pb-2">
              {m.clinics.map((c) => (
                <li
                  key={c.resourceId}
                  className="flex items-center justify-between py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-brand-ink">
                      {c.name}
                    </p>
                    <p className="text-xs text-brand-gray">
                      {c.role}
                      {c.accessVia === "INHERITED_FROM_ORG" && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-600">
                          Heredado
                        </span>
                      )}
                    </p>
                  </div>

                  <EnterLink
                    href={`/account/${m.accountId}/clinic/${c.resourceId}`}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-brand-gray hover:bg-gray-50"
                    resourceId={c.resourceId}
                    resourceType={"CLINIC"}
                  >
                    Entrar
                  </EnterLink>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
    </div>
  );
}
