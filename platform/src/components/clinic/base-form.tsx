import { Input } from "@/components/common/form";
import { fieldError, type FieldErrors } from "@/lib/actions/types";

interface ClinicFields extends Record<string, unknown> {
  name: string;
  phone: string;
  address: string;
}

interface Props {
  formId: string;
  action: (formData: FormData) => void;
  clinic?: any;
  fieldErrors?: FieldErrors<ClinicFields>;
}

export const ClinicBaseForm = ({
  formId,
  action,
  clinic,
  fieldErrors,
}: Props) => {
  return (
    <form id={formId} action={action} className="flex flex-col gap-y-3">
      <Input
        label="Nombre de la sede"
        name="name"
        value={clinic?.name}
        error={fieldError(fieldErrors, "name")}
      />
      <Input
        label="Teléfono"
        name="phone"
        error={fieldError(fieldErrors, "phone")}
      />
      <Input
        label="Dirección"
        name="address"
        error={fieldError(fieldErrors, "address")}
      />
    </form>
  );
};
