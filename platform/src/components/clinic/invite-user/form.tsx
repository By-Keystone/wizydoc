"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/common/form";
import { Specialty } from "@/lib/api/specialty/types";
import {
  LookedUpUser,
  lookupUserByEmailAction,
} from "@/lib/actions/user/lookup-user-by-email.action";
import { SpecialtyMultiSelect } from "./specialty-multi-select";
import { fieldError, type FieldErrors } from "@/lib/actions/types";

interface InviteUserFields extends Record<string, unknown> {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  specialtyIds: string[];
}

interface Props {
  formId: string;
  action: (formData: FormData) => void;
  organizationId: string;
  specialties: Specialty[];
  isPending: boolean;
  onCancel: () => void;
  fieldErrors?: FieldErrors<InviteUserFields>;
}

export const InviteUserForm = ({
  formId,
  action,
  organizationId,
  specialties,
  isPending,
  onCancel,
  fieldErrors,
}: Props) => {
  const formRef = useRef<HTMLFormElement>(null);
  const [step, setStep] = useState<"email" | "details">("email");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [role, setRole] = useState<"USER" | "DOCTOR">("USER");
  const [existingUser, setExistingUser] = useState<LookedUpUser | null>(null);
  const [isLookingUp, startLookup] = useTransition();

  // Paso 1 → 2: verifica el correo (con feedback visible) y precarga datos.
  const handleContinue = () => {
    const value = (
      (new FormData(formRef.current!).get("email") as string) ?? ""
    ).trim();

    if (!value || !value.includes("@")) {
      setEmailError("Ingresa un correo electrónico válido");
      return;
    }

    setEmailError(null);
    setEmail(value);
    startLookup(async () => {
      const user = await lookupUserByEmailAction(value);
      setExistingUser(user);
      setStep("details");
    });
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    action(new FormData(e.currentTarget));
  };

  return (
    <form
      ref={formRef}
      id={formId}
      onSubmit={handleSubmit}
      className="flex flex-col gap-y-3"
    >
      {step === "email" ? (
        <>
          <Input
            label="Correo electrónico"
            name="email"
            type="email"
            value={email}
            placeholder="usuario@correo.com"
            autoFocus
            error={emailError ?? undefined}
          />
          <p className="text-xs text-brand-gray">
            Verificaremos si ya tiene una cuenta para precargar sus datos.
          </p>

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={isLookingUp}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleContinue} disabled={isLookingUp}>
              {isLookingUp ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verificando...
                </>
              ) : (
                "Continuar"
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          {/* El correo ya no se edita aquí; viaja en un hidden dentro del form. */}
          <input type="hidden" name="email" value={email} />
          <div className="flex items-center justify-between rounded-lg bg-brand-surface px-3 py-2 text-sm">
            <span className="truncate text-brand-gray">{email}</span>
            <button
              type="button"
              onClick={() => setStep("email")}
              className="ml-2 shrink-0 text-xs font-medium text-brand-teal hover:text-brand-teal-dark"
            >
              Cambiar
            </button>
          </div>

          <div
            className={`rounded-lg px-3 py-2 text-xs ${
              existingUser
                ? "bg-brand-teal/10 text-brand-teal"
                : "bg-brand-surface text-brand-gray"
            }`}
          >
            {existingUser
              ? "Ya tiene una cuenta — precargamos sus datos."
              : "Usuario nuevo — completa sus datos."}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              key={`name-${existingUser?.id ?? "new"}`}
              label="Nombre"
              name="name"
              value={existingUser?.name}
              error={fieldError(fieldErrors, "name")}
            />
            <Input
              key={`lastName-${existingUser?.id ?? "new"}`}
              label="Apellido"
              name="lastName"
              value={existingUser?.lastName}
              error={fieldError(fieldErrors, "lastName")}
            />
          </div>

          <Input
            key={`phone-${existingUser?.id ?? "new"}`}
            label="Teléfono"
            name="phone"
            value={existingUser?.phone}
            error={fieldError(fieldErrors, "phone")}
          />

          <Select
            label="Rol"
            name="role"
            value={role}
            onChange={(e) => setRole(e.target.value as "USER" | "DOCTOR")}
            options={[
              { label: "Usuario", value: "USER" },
              { label: "Doctor", value: "DOCTOR" },
            ]}
          />

          {role === "DOCTOR" && (
            <SpecialtyMultiSelect
              organizationId={organizationId}
              initialSpecialties={specialties}
            />
          )}

          <div className="mt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep("email")}
              disabled={isPending}
            >
              Atrás
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Enviando..." : "Enviar invitación"}
            </Button>
          </div>
        </>
      )}
    </form>
  );
};
