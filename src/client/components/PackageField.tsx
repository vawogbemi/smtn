import { useState } from "react";
import {
  Button,
  Group,
  Label,
  NumberField as AriaNumberField,
  NumberFieldProps as AriaNumberFieldProps,
  ValidationResult,
} from "react-aria-components";
import {
  fieldBorderStyles,
  FieldError,
  FieldGroup,
  Input,
} from "./Field";
import { composeTailwindRenderProps, focusRing } from "./utils";
import { tv } from "tailwind-variants";
import {
  IconMinus,
  IconPlus,
} from "@tabler/icons-react";

export interface NumberFieldProps extends AriaNumberFieldProps {
  errorMessage?: string | ((validation: ValidationResult) => string);
  placeholder?: string;
  name?: string;
}

interface Package {
  quantity: number;
  weight: number;
  length: number;
  width: number;
  height: number;
}

export function PackageField() {
  const [packages, setPackages] = useState<Package[]>([]);

  const addPackage = () => {
    const newPackage: Package = {
      quantity: 1,
      weight: 1,
      length: 1,
      width: 1,
      height: 1,
    };
    setPackages([...packages, newPackage]);
  };

  const removeLastPackage = () => {
    if (packages.length > 0) {
      setPackages(packages.slice(0, -1));
    }
  };

  const updatePackage = (
    index: number,
    field: keyof Package,
    value: number,
  ) => {
    setPackages(
      packages.map((pkg, i) => i === index ? { ...pkg, [field]: value } : pkg),
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <input
        type="hidden"
        name="packages"
        value={JSON.stringify(packages)}
      />

      <div className="flex gap-2 w-full text-sm font-medium text-text-secondary">
        <div className="flex-1">
          <Label>Quantity</Label>
        </div>
        <div className="flex-1">
          <Label>Weight</Label>
        </div>
        <div className="flex-2">
          <Label>Dimensions</Label>
        </div>
      </div>

      {packages.map((pkg, index) => (
        <div
          key={index}
          className="flex flex-col gap-2"
        >
          <Group className="flex gap-2 w-full">
            <NumberField
              value={pkg.quantity}
              onChange={(value) => updatePackage(index, "quantity", value)}
              errorMessage="Invalid package number"
              placeholder="0"
              minValue={1}
              isRequired
            />
            <NumberField
              value={pkg.weight}
              onChange={(value) => updatePackage(index, "weight", value)}
              errorMessage="Invalid package number"
              placeholder="0"
              minValue={0}
              isRequired
            />
            <DimensionField
              length={pkg.length}
              width={pkg.width}
              height={pkg.height}
              onLengthChange={(value) => updatePackage(index, "length", value)}
              onWidthChange={(value) => updatePackage(index, "width", value)}
              onHeightChange={(value) => updatePackage(index, "height", value)}
            />
          </Group>
        </div>
      ))}

      <div className="flex gap-2 border-t border-border pt-2">
        <Button
          onPress={addPackage}
          className="h-9 px-6 py-2 bg-surface-alt text-text-muted hover:bg-hover rounded-lg transition-colors text-sm font-medium"
        >
          <IconPlus className="w-5 h-5" />
        </Button>
        <Button
          onPress={removeLastPackage}
          className="h-9 px-6 py-2 bg-surface-alt text-text-muted hover:bg-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          isDisabled={packages.length === 0}
        >
          <IconMinus className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

interface DimensionFieldProps
  extends Omit<NumberFieldProps, "value" | "onChange"> {
  className?: string;
  length?: number;
  width?: number;
  height?: number;
  onLengthChange?: (value: number) => void;
  onWidthChange?: (value: number) => void;
  onHeightChange?: (value: number) => void;
}

export function DimensionField({
  errorMessage,
  placeholder,
  className,
  length,
  width,
  height,
  onLengthChange,
  onWidthChange,
  onHeightChange,
  ...props
}: DimensionFieldProps) {
  const fieldClassName = "group flex flex-1 font-sans";
  const inputClassName =
    "w-full h-full border-0 outline-none bg-transparent px-3 text-center";
  return (
    <FieldGroup className={`flex-2 min-w-0 ${className ?? ""}`}>
      <AriaNumberField
        {...props}
        value={length}
        onChange={onLengthChange}
        className={fieldClassName}
      >
        <Input className={inputClassName} placeholder={placeholder || "1"} />
        <FieldError>{errorMessage}</FieldError>
      </AriaNumberField>
      <span className="my-auto text-gray-300 px-1">x</span>
      <AriaNumberField
        {...props}
        value={width}
        onChange={onWidthChange}
        className={fieldClassName}
      >
        <Input className={inputClassName} placeholder={placeholder || "1"} />
        <FieldError>{errorMessage}</FieldError>
      </AriaNumberField>
      <span className="my-auto text-gray-300 px-1">x</span>
      <AriaNumberField
        {...props}
        value={height}
        onChange={onHeightChange}
        className={fieldClassName}
      >
        <Input className={inputClassName} placeholder={placeholder || "1"} />
        <FieldError>{errorMessage}</FieldError>
      </AriaNumberField>
    </FieldGroup>
  );
}

export const fieldGroupStyles = tv({
  extend: focusRing,
  base:
    "group flex items-center h-9 box-border bg-surface border rounded-lg overflow-hidden transition flex border border-border rounded-lg flex-[2] min-w-0 overflow-hidden",
  variants: fieldBorderStyles.variants,
});

export function NumberField({
  errorMessage,
  placeholder,
  name,
  ...props
}: NumberFieldProps) {
  return (
    <AriaNumberField
      {...props}
      name={name}
      className={composeTailwindRenderProps(
        props.className,
        "group flex flex-col gap-1 font-sans flex-1",
      )}
    >
      <FieldGroup>
        {(renderProps) => (
          <>
            <Input
              className="w-full h-10 px-3 text-center"
              placeholder={placeholder}
            />
            <div
              className={fieldBorderStyles({
                ...renderProps,
                class: "flex flex-col h-10",
              })}
            >
              <div
                className={fieldBorderStyles({
                  ...renderProps,
                  class: "border-b",
                })}
              />
            </div>
          </>
        )}
      </FieldGroup>
      <FieldError>{errorMessage}</FieldError>
    </AriaNumberField>
  );
}