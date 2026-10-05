"use client";

import { Input } from "@/components/common/form";
import { fieldError, type FieldErrors } from "@/lib/actions/types";

interface OrganizationFields extends Record<string, unknown> {
  name: string;
}

interface Props {
  formId: string;
  action: (formData: FormData) => void;
  fieldErrors?: FieldErrors<OrganizationFields>;
}

export const CreateOrganizationForm = ({
  formId,
  action,
  fieldErrors,
}: Props) => {
  return (
    <form id={formId} action={action}>
      <Input
        label="Nombre"
        name="name"
        error={fieldError(fieldErrors, "name")}
      />
    </form>
  );
};
