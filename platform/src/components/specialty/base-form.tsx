import { Input } from "@/components/common/form";
import type { Specialty } from "@/lib/api/specialty/types";
import { fieldError, type FieldErrors } from "@/lib/actions/types";

interface SpecialtyFields extends Record<string, unknown> {
  name: string;
}

interface Props {
  formId: string;
  action: (formData: FormData) => void;
  specialty?: Specialty;
  fieldErrors?: FieldErrors<SpecialtyFields>;
}

export const SpecialtyBaseForm = ({
  formId,
  action,
  specialty,
  fieldErrors,
}: Props) => {
  return (
    <form id={formId} action={action} className="flex flex-col gap-y-3">
      <Input
        label="Nombre de la especialidad"
        name="name"
        value={specialty?.name}
        error={fieldError(fieldErrors, "name")}
      />
    </form>
  );
};
