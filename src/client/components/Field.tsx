import { forwardRef } from "react";
import {
  Button as RACButton,
  ButtonProps as RACButtonProps,
  composeRenderProps,
  FieldError as RACFieldError,
  FieldErrorProps,
  Group,
  GroupProps,
  Input as RACInput,
  InputProps,
  Label as RACLabel,
  LabelProps,
  Text,
  TextArea as RACTextArea,
  TextAreaProps,
  TextProps,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";
import { composeTailwindRenderProps, focusRing } from "./utils";

export function Label(props: LabelProps) {
  return (
    <RACLabel
      {...props}
      className={twMerge(
        "font-sans text-sm text-text-secondary font-medium cursor-default w-fit",
        props.className,
      )}
    />
  );
}
export function Description(props: TextProps) {
  return (
    <Text
      {...props}
      slot="description"
      className={twMerge("text-sm text-text-secondary", props.className)}
    />
  );
}
export function FieldError(props: FieldErrorProps) {
  return (
    <RACFieldError
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "text-sm text-red-600",
      )}
    />
  );
}
export const fieldBorderStyles = tv({
  base: "transition",
  variants: {
    isFocusWithin: {
      false: "border-border hover:border-text-muted",
      true: "border-primary",
    },
    isInvalid: {
      true: "border-red-600",
    },
    isDisabled: {
      true: "border-border",
    },
  },
});
export const fieldGroupStyles = tv({
  extend: focusRing,
  base:
    "group flex items-center h-9 box-border bg-surface border rounded-lg overflow-hidden transition",
  variants: fieldBorderStyles.variants,
});
export function FieldGroup(props: GroupProps) {
  return (
    <Group
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) =>
          fieldGroupStyles({ ...renderProps, className }),
      )}
    />
  );
}
export function Input(props: InputProps) {
  return (
    <RACInput
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "px-3 py-0 min-h-9 flex-1 min-w-0 border-0 outline bg-surface font-sans text-sm text-text-primary placeholder:text-text-muted disabled:text-border disabled:placeholder:text-border [-webkit-tap-highlight-color:transparent]",
      )}
    />
  );
}
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(
  (props, ref) => (
    <RACTextArea
      {...props}
      ref={ref}
      className={composeTailwindRenderProps(
        props.className,
        "px-3 py-2 min-h-20 w-full border rounded-lg outline bg-surface font-sans text-sm text-text-primary placeholder:text-text-muted disabled:text-border disabled:placeholder:text-border resize-y transition border-border hover:border-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:border-border disabled:bg-surface-alt [-webkit-tap-highlight-color:transparent]",
      )}
    />
  ),
);
export interface ButtonProps extends RACButtonProps {
  /** @default 'primary' */
  variant?: "primary" | "secondary" | "destructive" | "icon";
}
let button = tv({
  extend: focusRing,
  base:
    "relative inline-flex items-center border-0 font-sans text-sm text-center transition rounded-md cursor-default p-1 flex items-center justify-center text-text-secondary bg-transparent hover:bg-hover pressed:bg-border disabled:bg-transparent [-webkit-tap-highlight-color:transparent]",
  variants: {
    isDisabled: {
      true: "bg-surface-alt text-text-muted border-border",
    },
  },
});
export function FieldButton(props: ButtonProps) {
  return (
    <RACButton
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) => button({ ...renderProps, className }),
      )}
    >
      {props.children}
    </RACButton>
  );
}