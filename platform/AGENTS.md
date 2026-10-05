# platform/AGENTS.md

Next.js 15 App Router. El navegador nunca llama al api directamente: todo pasa
por el servidor de Next, que reenvía la cookie de sesión de Better Auth.

## Flujo de datos

- Lecturas: `src/lib/api/<dominio>/index.ts` usando `doFetchJson` de
  `src/lib/api/fetch.ts` (`server-only`). Tipos en `types.ts` al lado.
- Mutaciones: Server Actions en `src/lib/actions/<dominio>/<accion>.action.ts`
  con `"use server"`. Patrón:
  1. `getSession()` → si no hay, `{ status: "auth-expired" }`.
  2. Validar `FormData` con Zod y devolver `fieldErrors` con `treeifyError`.
  3. `doFetchJson(...)` y `revalidateTag(...)` con los tags del cliente de api.
  4. Errores con `toActionState(error)`.
- En el cliente, los formularios usan `useFormAction` y `toast` de `src/lib/toast.ts`.

## Rutas

- `(auth)`, `(onboarding)`: login, registro, invitaciones.
- `account/[accountId]/organization/[resourceId]/...` y
  `account/[accountId]/clinic/[clinicId]/...`: app privada (guards en
  `src/lib/auth/guards.ts` y `src/middleware.ts`).
- `clinic/[clinicId]/create-appointment`: **booking público**, sin sesión.
- Cada segmento con datos tiene `loading.tsx` y `error.tsx`.

## UI

- Componentes base en `src/components/ui/` (estilo shadcn: `cva`, `cn` de
  `src/lib/utils.ts`). Comunes en `src/components/common/`. Reutiliza antes de crear.
- Íconos de `lucide-react`. Textos de UI en español.
- Variables públicas sólo con prefijo `NEXT_PUBLIC_`; nada secreto en el cliente.
- Si existe `docs/features/<slug>/mockup.html`, la UI debe coincidir con él.