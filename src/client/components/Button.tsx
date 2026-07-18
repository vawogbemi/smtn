import {
  Button as RACButton,
  ButtonProps as RACButtonProps,
  composeRenderProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { focusRing } from "./utils";

export interface ButtonProps extends RACButtonProps {
  /** @default 'primary' */
  variant?: "primary" | "secondary" | "destructive" | "quiet";
}

let button = tv({
  extend: focusRing,
  base:
    "relative inline-flex items-center justify-center gap-1.5 border border-transparent h-8 box-border px-3 py-0 [&:has(>svg:only-child)]:px-0 [&:has(>svg:only-child)]:w-8 font-sans text-sm font-medium leading-none text-center transition-colors duration-100 rounded-md cursor-default select-none [-webkit-tap-highlight-color:transparent]",
  variants: {
    variant: {
      primary:
        "bg-primary border-primary text-white hover:bg-secondary pressed:bg-secondary shadow-xs",
      secondary:
        "border-border bg-surface text-text-primary hover:bg-surface-alt pressed:bg-hover shadow-xs",
      destructive:
        "bg-red-600 border-red-600 text-white hover:bg-red-700 pressed:bg-red-700 shadow-xs",
      quiet:
        "border-transparent bg-transparent text-text-secondary hover:bg-surface-alt hover:text-text-primary pressed:bg-hover",
    },
    isDisabled: {
      true:
        "border-transparent bg-surface-alt text-text-muted forced-colors:text-[GrayText] opacity-60",
    },
    isPending: {
      true: "text-transparent",
    },
  },
  defaultVariants: {
    variant: "primary",
  },
  compoundVariants: [
    {
      variant: "quiet",
      isDisabled: true,
      class: "bg-transparent",
    },
  ],
});

export function Button(props: ButtonProps) {
  return (
    <RACButton
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) =>
          button({ ...renderProps, variant: props.variant, className }),
      )}
    >
      {composeRenderProps(props.children, (children, { isPending }) => (
        <>
          {children}
          {isPending && (
            <span
              aria-hidden
              className="flex absolute inset-0 justify-center items-center"
            >
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                stroke={props.variant === "primary" ||
                    props.variant === "destructive"
                  ? "white"
                  : "var(--color-text-primary)"}
              >
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  strokeWidth="4"
                  fill="none"
                  className="opacity-25"
                />
                <circle
                  cx="12"
                  cy="12"
                  r="10"
                  strokeWidth="4"
                  strokeLinecap="round"
                  fill="none"
                  pathLength="100"
                  strokeDasharray="60 140"
                  strokeDashoffset="0"
                />
              </svg>
            </span>
          )}
        </>
      ))}
    </RACButton>
  );
}