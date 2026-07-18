import {
  TextField as AriaTextField,
  TextFieldProps as AriaTextFieldProps,
  ValidationResult,
} from "react-aria-components";
import { ClassProp, tv } from "tailwind-variants";
import {
  Description,
  fieldBorderStyles,
  FieldError,
  Input,
  Label,
} from "./Field";
import { composeTailwindRenderProps, focusRing } from "./utils";

const inputStyles = tv({
  extend: focusRing,
  base:
    "border-1 rounded-lg min-h-9 font-sans text-sm py-0 pr-3 box-border transition w-full",
  variants: {
    isFocused: fieldBorderStyles.variants.isFocusWithin,
    isInvalid: fieldBorderStyles.variants.isInvalid,
    isDisabled: fieldBorderStyles.variants.isDisabled,
    hasIcon: {
      true: "pl-9",
      false: "pl-3",
    },
  },
});

export interface TextFieldProps extends AriaTextFieldProps {
  label?: string;
  description?: string;
  placeholder?: string;
  errorMessage?: string | ((validation: ValidationResult) => string);
  icon?: React.ReactNode;
}

export function PlacesTextField(
  { label, description, errorMessage, icon, ...props }: TextFieldProps,
) {
  return (
    <AriaTextField
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "flex flex-col gap-1 font-sans",
      )}
    >
      {label && <Label>{label}</Label>}
      <div className="relative flex items-center w-full min-h-9">
        {icon && (
          <span className="absolute left-2.5 flex items-center pointer-events-none text-text-muted">
            {icon}
          </span>
        )}
        <Input
          className={(renderProps) =>
            inputStyles({ ...renderProps, hasIcon: !!icon })}
        />
      </div>
      {description && <Description>{description}</Description>}
      <FieldError>{errorMessage}</FieldError>
    </AriaTextField>
  );
}