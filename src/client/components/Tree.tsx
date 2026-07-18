import {
  Button,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  TreeItemContent as AriaTreeItemContent,
  type TreeItemProps as AriaTreeItemProps,
  type TreeProps,
} from "react-aria-components";
import { IconChevronRight } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { tv } from "tailwind-variants";
import { composeTailwindRenderProps, focusRing } from "./utils";

const itemStyles = tv({
  extend: focusRing,
  base:
    "group relative font-sans flex items-center cursor-default select-none rounded-md h-8 pr-2 text-sm text-text-secondary transition-colors duration-100 -outline-offset-2 [-webkit-tap-highlight-color:transparent]",
  variants: {
    isSelected: {
      false: "hover:bg-hover pressed:bg-hover",
      true:
        "bg-primary/8 text-primary font-medium hover:bg-primary/12 pressed:bg-primary/12",
    },
    isDisabled: {
      true: "text-text-muted opacity-50 forced-colors:text-[GrayText]",
    },
  },
});

export function Tree<T>({ children, ...props }: TreeProps<T>) {
  return (
    <AriaTree
      {...props}
      className={composeTailwindRenderProps(
        props.className,
        "w-full max-w-full overflow-auto relative flex flex-col gap-0.5 px-0 py-1 outline-none",
      )}
    >
      {children}
    </AriaTree>
  );
}

const expandButton = tv({
  extend: focusRing,
  base:
    "border-0 p-0 bg-transparent shrink-0 w-5 h-5 rounded flex items-center justify-center cursor-default text-text-muted hover:text-text-primary [-webkit-tap-highlight-color:transparent]",
  variants: {
    isDisabled: {
      true: "text-text-muted forced-colors:text-[GrayText]",
    },
  },
});

const chevron = tv({
  base: "w-4 h-4 transition-transform duration-200 ease-in-out",
  variants: {
    isExpanded: {
      true: "rotate-90",
    },
  },
});

export interface TreeItemProps extends Partial<AriaTreeItemProps> {
  title: string;
  icon?: ReactNode;
}

export function TreeItem({ title, icon, children, ...props }: TreeItemProps) {
  return (
    <AriaTreeItem className={itemStyles} textValue={title} {...props}>
      <AriaTreeItemContent>
        {({ hasChildItems, isExpanded, isDisabled, level }) => {
          // Nested items that have children toggle expansion on row click.
          // Root items (level 1) keep regular selection/action behavior.
          const expandOnRow = hasChildItems && level > 1;
          const indent = <div className="shrink-0" style={{ width: (level - 1) * 4 }} />;
          const chevronIcon = (
            <IconChevronRight aria-hidden className={chevron({ isExpanded })} />
          );
          const iconEl = icon
            ? (
              <span className="shrink-0 flex items-center text-text-muted [&_svg]:h-4 [&_svg]:w-4">
                {icon}
              </span>
            )
            : null;

          if (expandOnRow) {
            // The chevron slot wires the press to toggle expansion, so making it
            // span the whole row makes a row click expand/collapse without selecting.
            return (
              <Button
                slot="chevron"
                className="flex items-center gap-1.5 w-full h-full cursor-default outline-none [-webkit-tap-highlight-color:transparent]"
              >
                {indent}
                <span className="shrink-0 text-text-muted group-hover:text-text-primary">
                  {chevronIcon}
                </span>
                {iconEl}
                <span className="truncate text-sm">{title}</span>
              </Button>
            );
          }

          return (
            <div className="flex items-center gap-1.5 w-full">
              {indent}
              {hasChildItems
                ? (
                  <Button slot="chevron" className={expandButton({ isDisabled })}>
                    {chevronIcon}
                  </Button>
                )
                : <div className="shrink-0 w-5 h-5" />}
              {iconEl}
              <span className="truncate text-sm">{title}</span>
            </div>
          );
        }}
      </AriaTreeItemContent>
      {children}
    </AriaTreeItem>
  );
}
