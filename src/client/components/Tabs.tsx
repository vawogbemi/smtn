import {
  composeRenderProps,
  Tab as RACTab,
  TabList as RACTabList,
  TabListProps,
  TabPanel as RACTabPanel,
  TabPanelProps,
  TabPanels as RACTabPanels,
  TabPanelsProps,
  TabProps,
  Tabs as RACTabs,
  TabsProps,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { focusRing } from "./utils";
import { twMerge } from "tailwind-merge";

const tabsStyles = tv({
  base: "flex gap-4 font-sans w-full",
  variants: {
    orientation: {
      horizontal: "flex-col", // Stack vertically: tabs on top, panels below
      vertical: "flex-col",
    },
  },
});

export function Tabs(props: TabsProps) {
  return (
    <RACTabs
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) => tabsStyles({ ...renderProps, className }),
      )}
    />
  );
}

const tabListStyles = tv({
  base: "flex gap-3 w-full p-1 -m-1",
  variants: {
    orientation: {
      horizontal: "flex-row h-auto", // Vertical stack of tabs (like Uber product select)
      vertical: "flex-col h-auto", // Original vertical layout
    },
  },
});

export function TabList<T extends object>(props: TabListProps<T>) {
  return (
    <RACTabList
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) =>
          tabListStyles({ ...renderProps, className }),
      )}
    />
  );
}

const tabProps = tv({
  extend: focusRing,
  base:
    "group relative flex items-center cursor-pointer rounded-lg border border-border px-4 py-3 text-sm font-medium transition-colors duration-100 forced-color-adjust-none [-webkit-tap-highlight-color:transparent] bg-transparent text-text-secondary hover:bg-surface-alt flex-row justify-center h-[100px] gap-3 " +
    "[[data-orientation=horizontal]>&]:flex-1 [[data-orientation=horizontal]>&]:min-w-0",
  variants: {
    isSelected: {
      true:
        "border-primary bg-primary/5 text-primary font-semibold hover:bg-primary/8",
    },
    isDisabled: {
      true:
        "text-text-muted forced-colors:text-[GrayText] opacity-50 cursor-not-allowed hover:bg-transparent",
    },
  },
});

export function Tab(props: TabProps) {
  return (
    <RACTab
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) => tabProps({ ...renderProps, className }),
      )}
    >
      {props.children}
    </RACTab>
  );
}

export function TabPanels<T extends object>(props: TabPanelsProps<T>) {
  return (
    <RACTabPanels
      {...props}
      className={twMerge(
        "relative h-(--tab-panel-height) motion-safe:transition-[height] overflow-clip",
        props.className,
      )}
    />
  );
}

const tabPanelStyles = tv({
  extend: focusRing,
  base:
    "flex-1 box-border text-sm text-text-primary transition entering:opacity-0 exiting:opacity-0 exiting:absolute exiting:top-0 exiting:left-0 exiting:w-full",
});

export function TabPanel(props: TabPanelProps) {
  return (
    <RACTabPanel
      {...props}
      className={composeRenderProps(
        props.className,
        (className, renderProps) =>
          tabPanelStyles({ ...renderProps, className }),
      )}
    />
  );
}