import { IconCheck } from "@tabler/icons-react";
import {
  Collection,
  composeRenderProps,
  Header,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  ListBoxItemProps,
  ListBoxProps as AriaListBoxProps,
  ListBoxSection,
  SectionProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { composeTailwindRenderProps, focusRing } from "./utils";
import { ReactElement, JSXElementConstructor, ReactNode, ReactPortal } from "react";

interface ListBoxProps<T>
  extends Omit<AriaListBoxProps<T>, "layout" | "orientation"> {}

export function ListBox<T extends object>(
  { children, ...props }: ListBoxProps<T>,
) {
  return (
    <AriaListBox
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "outline-0 flex flex-col w-full gap-3 p-1 font-sans",
      )}
    >
      {children}
    </AriaListBox>
  );
}

export const itemStyles = tv({
  extend: focusRing,
  base:
    "group relative flex items-center w-full justify-center gap-3 cursor-pointer select-none rounded-xl border border-border px-4 py-3 text-sm font-medium transition forced-color-adjust-none [-webkit-tap-highlight-color:transparent] bg-transparent text-text-secondary hover:bg-hover w-full",
  variants: {
    isSelected: {
      false: "text-text-secondary hover:bg-hover",
      true: "border-primary bg-primary/4 text-primary font-semibold",
    },
    isDisabled: {
      true:
        "text-text-muted opacity-50 cursor-not-allowed hover:bg-transparent forced-colors:text-[GrayText]",
    },
  },
});

export function ListBoxItem(props: ListBoxItemProps) {
  let textValue = props.textValue ||
    (typeof props.children === "string" ? props.children : undefined);
  return (
    <AriaListBoxItem
      {...props}
      textValue={textValue}
      className={composeRenderProps(
        props.className,
        (className, renderProps) => itemStyles({ ...renderProps, className }),
      )}
    />
  );
}

export const dropdownItemStyles = tv({
  base:
    "group flex items-center gap-4 cursor-default select-none py-2 pl-3 pr-3 selected:pr-1 rounded-lg outline outline-0 text-sm forced-color-adjust-none no-underline [&[href]]:cursor-pointer bg-surface",
  variants: {
    isDisabled: {
      false: "text-text-primary",
      true: "text-text-muted forced-colors:text-[GrayText]",
    },
    isPressed: {
      true: "bg-hover",
    },
    isFocused: {
      true:
        "bg-primary text-white forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]",
    },
  },
  compoundVariants: [
    {
      isFocused: false,
      isOpen: true,
      className: "bg-hover",
    },
  ],
});

export function DropdownItem(props: ListBoxItemProps) {
  let textValue = props.textValue ||
    (typeof props.children === "string" ? props.children : undefined);
  return (
    <AriaListBoxItem
      {...props}
      textValue={textValue}
      className={dropdownItemStyles}
    >
      {composeRenderProps(props.children, (children: string | number | bigint | boolean | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | ReactPortal | Promise<string | number | bigint | boolean | ReactPortal | ReactElement<unknown, string | JSXElementConstructor<any>> | Iterable<ReactNode> | null | undefined> | null | undefined, { isSelected }: any) => (
        <>
          <span className="flex items-center flex-1 gap-2 font-normal truncate group-selected:font-semibold">
            {children}
          </span>
          <span className="flex items-center w-5">
            {isSelected && <IconCheck className="w-4 h-4" />}
          </span>
        </>
      ))}
    </AriaListBoxItem>
  );
}

export interface DropdownSectionProps<T> extends SectionProps<T> {
  title?: string;
  items?: any;
}

export function DropdownSection<T extends object>(
  props: DropdownSectionProps<T>,
) {
  return (
    <ListBoxSection className="first:-mt-1.25 after:content-[''] after:block after:h-1.25 last:after:hidden">
      <Header className="text-sm font-semibold text-text-secondary px-4 py-1 truncate sticky -top-1.25 -mt-px -mx-1 z-10 bg-surface-alt/60 backdrop-blur-md supports-[-moz-appearance:none]:bg-surface-alt border-y border-y-border [&+*]:mt-1">
        {props.title}
      </Header>
      <Collection items={props.items}>
        {props.children}
      </Collection>
    </ListBoxSection>
  );
}

export default ListBox