"use client";

import { Field, Input, Select } from "@/components/common/form";
import { Button } from "@/components/ui/button";
import { PhoneInput, splitPhone } from "@/components/ui/phone-input";
import { useFormAction } from "@/hooks/useFormAction";
import {
  type UpdateMyProfileFields,
  updateMyProfileAction,
} from "@/lib/actions/user/update-my-profile.action";
import { fieldError } from "@/lib/actions/types";
import type { MyProfile } from "@/lib/api/user/types";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ProfileCard } from "./profile-card";

const FORM_ID = "personal-data-form";
const DEFAULT_COUNTRY_CODE = "+51";

const TREATMENT_OPTIONS = [
  { label: "Sin tratamiento", value: "" },
  { label: "Dr.", value: "DR" },
  { label: "Dra.", value: "DRA" },
];

const DISABLED_CLASSES =
  "disabled:border-gray-200 disabled:bg-gray-50 disabled:text-brand-ink";

interface Props {
  profile: MyProfile;
}

export function PersonalDataCard({ profile }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const [dismissedErrors, setDismissedErrors] = useState<unknown>();

  // El tratamiento es de quien atiende en alguna sede, no de quien sólo administra.
  const isDoctor = profile.clinics.length > 0;

  const {
    submit,
    isPending,
    fieldErrors: submitErrors,
  } = useFormAction<UpdateMyProfileFields>(
    (formData) => updateMyProfileAction({ status: "idle" }, formData),
    {
      onSuccess: () => {
        setEditing(false);
        router.refresh();
      },
    },
  );

  // Cancelar descarta los errores del último envío, aunque el hook los conserve.
  const fieldErrors =
    submitErrors === dismissedErrors ? undefined : submitErrors;

  useEffect(() => {
    if (editing) {
      formRef.current?.querySelector<HTMLElement>("#treatment, #name")?.focus();
    } else if (wasEditing.current) {
      editButtonRef.current?.focus();
    }
    wasEditing.current = editing;
  }, [editing]);

  useEffect(() => {
    if (!fieldErrors) return;
    formRef.current
      ?.querySelector<HTMLElement>('[aria-invalid="true"]')
      ?.focus();
  }, [fieldErrors]);

  const handleCancel = () => {
    setEditing(false);
    setDismissedErrors(submitErrors);
    // `form.reset()` no limpia el estado propio de `PhoneInput`: se vuelve a montar.
    setFormVersion((version) => version + 1);
  };

  const nameError = fieldError(fieldErrors, "name");
  const lastNameError = fieldError(fieldErrors, "lastName");
  const phoneError = fieldError(fieldErrors, "phone");
  const phone = splitPhone(profile.phone, DEFAULT_COUNTRY_CODE);

  return (
    <ProfileCard
      titleId="personal-data-title"
      title="Datos personales"
      description={`Tus datos son los mismos en todas tus sedes.${
        isDoctor ? " Tu nombre es el que ven tus pacientes al reservar." : ""
      }`}
      action={
        editing ? null : (
          <Button
            ref={editButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className="h-[34px] px-3 text-[13px]"
            onClick={() => setEditing(true)}
          >
            Editar
          </Button>
        )
      }
    >
      <form
        key={`${formVersion}-${profile.name}-${profile.lastName}-${profile.phone}-${profile.treatment}`}
        ref={formRef}
        id={FORM_ID}
        // Con `action`, React 19 vuelve los campos a su valor inicial tras cada envío y se perdería lo escrito si hay errores.
        onSubmit={(event) => {
          event.preventDefault();
          submit(new FormData(event.currentTarget));
        }}
        noValidate
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {isDoctor && (
            <div className="flex flex-col gap-1">
              <Select
                label="Tratamiento"
                name="treatment"
                options={TREATMENT_OPTIONS}
                defaultValue={profile.treatment ?? ""}
                disabled={!editing}
                aria-describedby="treatment-help"
                className={DISABLED_CLASSES}
              />
              <p
                id="treatment-help"
                className="text-xs leading-snug text-brand-gray"
              >
                Opcional. Sin tratamiento, tus pacientes ven solo tu nombre.
              </p>
            </div>
          )}
          <Input
            label="Nombre"
            name="name"
            value={profile.name}
            autoComplete="given-name"
            disabled={!editing}
            error={nameError}
            className={DISABLED_CLASSES}
          />
          <Input
            label="Apellido"
            name="lastName"
            value={profile.lastName}
            autoComplete="family-name"
            disabled={!editing}
            error={lastNameError}
            className={DISABLED_CLASSES}
          />
          <Field label="Celular" htmlFor="phone" error={phoneError}>
            <PhoneInput
              id="phone"
              name="phone"
              autoComplete="tel-national"
              defaultCountryCode={phone.countryCode}
              defaultValue={phone.number}
              disabled={!editing}
              invalid={!!phoneError}
              aria-describedby={phoneError ? "phone-error" : undefined}
            />
          </Field>
          <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
            <span className="text-sm font-medium text-brand-gray">
              Correo electrónico
            </span>
            <p className="break-words rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              {profile.email}
            </p>
            <p className="text-xs leading-snug text-brand-gray">
              Tu correo es tu usuario para iniciar sesión y por ahora no se
              puede cambiar.
            </p>
          </div>
        </div>

        {isDoctor && profile.doctorDisplayName && (
          <p className="mt-3.5 break-words text-[13px] text-brand-gray">
            Así te ven tus pacientes al reservar:{" "}
            <b className="text-brand-ink">{profile.doctorDisplayName}</b>
          </p>
        )}

        {editing && (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={handleCancel}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 sm:flex-none"
              disabled={isPending}
            >
              {isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        )}
      </form>
    </ProfileCard>
  );
}
