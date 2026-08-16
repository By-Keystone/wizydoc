import { LabelHTMLAttributes } from "react";

/** Label estándar de formularios. */
export const Label = ({
  className,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement>) => (
  <label
    className={`text-sm font-medium text-brand-gray ${className ?? ""}`}
    {...rest}
  />
);
