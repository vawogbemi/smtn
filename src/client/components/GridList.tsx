import { ReactNode, useState } from "react";
import {
  composeRenderProps,
  Dialog,
  DialogTrigger,
  GridList as AriaGridList,
  GridListItem as AriaGridListItem,
  GridListItemProps,
  GridListProps,
  Key,
  Selection,
} from "react-aria-components";
import { tv } from "tailwind-variants";
import { Checkbox } from "@react-spectrum/s2";
import { composeTailwindRenderProps, focusRing, useIsMobile } from "./utils";
import {
  ModalOverlay,
  type ModalOverlayProps,
  Modal as RACModal,
} from "react-aria-components/Modal";
import ImportShipment from "./ImportShipment";
import SendMessage from "./SendMessage";
import { Button } from "./Button";


const overlayStyles = tv({
  base: "absolute top-0 left-0 w-full h-(--page-height) isolate z-20 bg-black/[50%] text-center backdrop-blur-lg",
  variants: {
    isEntering: {
      true: "animate-in fade-in duration-200 ease-out",
    },
    isExiting: {
      true: "animate-out fade-out duration-200 ease-in",
    },
  },
});

const modalStyles = tv({
  base: "font-sans w-[90vw] max-h-[calc(var(--visual-viewport-height)*.9)] rounded-2xl bg-white dark:bg-neutral-800/70 dark:backdrop-blur-2xl dark:backdrop-saturate-200 forced-colors:bg-[Canvas] text-left align-middle text-neutral-700 dark:text-neutral-300 shadow-2xl bg-clip-padding border border-black/10 dark:border-white/10",
  variants: {
    isEntering: {
      true: "animate-in zoom-in-105 ease-out duration-200",
    },
    isExiting: {
      true: "animate-out zoom-out-95 ease-in duration-200",
    },
  },
});

export function Modal({ className, ...props }: ModalOverlayProps) {
  return (
    <ModalOverlay {...props} className={overlayStyles}>
      <div className="sticky top-0 left-0 w-full h-(--visual-viewport-height) flex items-center justify-center box-border">
        <RACModal
          {...props}
          className={composeRenderProps(className, (cn, renderProps) =>
            modalStyles({ ...renderProps, className: cn }),
          )}
        />
      </div>
    </ModalOverlay>
  );
}

export function GridList<T extends object>({
  children,
  items,
  selectionMode,
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  ...props
}: GridListProps<T>) {
  const isMobile = useIsMobile();
  const [internalSelectedKeys, setInternalSelectedKeys] = useState<Selection>(
    () =>
      defaultSelectedKeys === "all"
        ? "all"
        : new Set(defaultSelectedKeys ?? []),
  );
  const isControlled = selectedKeys !== undefined;
  const currentSelectedKeys = isControlled
    ? selectedKeys!
    : internalSelectedKeys;

  const handleSelectionChange = (keys: Selection) => {
    if (!isControlled) setInternalSelectedKeys(keys);
    onSelectionChange?.(keys);
  };

  const itemKeys: Key[] = items
    ? Array.from(items, (item: any) => item.id)
    : [];
  const isAllSelected =
    itemKeys.length > 0 &&
    (currentSelectedKeys === "all" ||
      itemKeys.every((k) => (currentSelectedKeys as Set<Key>).has(k)));
  const hasAnySelected =
    currentSelectedKeys === "all" || (currentSelectedKeys as Set<Key>).size > 0;

  const toggleSelectAll = (selected: boolean) => {
    handleSelectionChange(selected ? new Set(itemKeys) : new Set());
  };

  const selectedIds = (currentSelectedKeys === "all"
    ? itemKeys
    : [...(currentSelectedKeys as Set<Key>)]).map(String);

  return (
    <>
      {selectionMode === "multiple" && (
        <div className="cursor-default p-3 pl-5 md:pl-5.25 flex flex-wrap items-center w-[calc(100%+0.5rem)] min-h-15 -mx-1 border-b-9 border-border gap-2 md:gap-3">
          <Checkbox
            aria-label="Select all"
            size={isMobile ? "M" : "XL"}
            isSelected={isAllSelected}
            isIndeterminate={hasAnySelected && !isAllSelected}
            isDisabled={itemKeys.length === 0}
            onChange={toggleSelectAll}
            UNSAFE_className="mr-3"
          />
          <DialogTrigger>
            <Button
              variant="quiet"
              aria-label={hasAnySelected ? "Send message" : "Import shipment"}
              className="rounded-full h-6 px-2 text-xs md:h-8 md:px-3 md:text-sm"
            >
              {hasAnySelected ? "Send Message" : "Import Shipment"}
            </Button>
            <Modal isDismissable className="h-full">
              <Dialog className="h-full outline-none">
                {hasAnySelected
                  ? <SendMessage orderIds={selectedIds} />
                  : <ImportShipment />}
              </Dialog>
            </Modal>
          </DialogTrigger>
        </div>
      )}
      <AriaGridList
        {...props}
        items={items}
        selectionMode={selectionMode}
        selectedKeys={currentSelectedKeys}
        onSelectionChange={handleSelectionChange}
        className={composeTailwindRenderProps(
          props.className,
          "outline-0 flex flex-col w-full gap-3 font-sans empty:items-center empty:justify-center empty:italic empty:text-sm empty:text-text-muted",
        )}
      >
        {children}
      </AriaGridList>
    </>
  );
}

const itemStyles = tv({
  extend: focusRing,
  base: "group relative flex items-center w-full gap-3 cursor-pointer select-none rounded-lg border border-surface px-3 text-sm font-medium transition-colors duration-100 forced-color-adjust-none [-webkit-tap-highlight-color:transparent] bg-surface text-text-secondary -outline-offset-2",
  variants: {
    isSelected: {
      false: "text-text-secondary hover:bg-hover pressed:bg-hover",
      true: "border-primary bg-primary/4 text-primary font-semibold hover:bg-primary/8 pressed:bg-primary/8 z-20",
    },
    isDisabled: {
      true: "text-text-muted opacity-50 cursor-not-allowed hover:bg-transparent forced-colors:text-[GrayText] z-10",
    },
  },
});

interface GridListItemPropsWithNav extends GridListItemProps {
  to?: string;
  modalContent?: ReactNode;
}

export function GridListItem({
  children,
  modalContent,
  ...props
}: GridListItemPropsWithNav) {
  const isMobile = useIsMobile();
  const textValue = typeof children === "string" ? children : undefined;
  return (
    <AriaGridListItem
      textValue={textValue}
      {...props}
      className={composeRenderProps(props.className, (className, renderProps) =>
        itemStyles({ ...renderProps, className }),
      )}
    >
      {composeRenderProps(
        children,
        (children, { selectionMode, selectionBehavior, allowsDragging }) => (
          <>
            {/* Add elements for drag and drop and selection. */}
            {allowsDragging && (
              <Button variant="quiet" slot="drag">
                ≡
              </Button>
            )}
            {selectionMode !== "none" && selectionBehavior === "toggle" && (
              <Checkbox slot="selection" size={isMobile ? "M" : "XL"} />
            )}
            {modalContent
              ? (
                <DialogTrigger>
                  <Button
                    variant="quiet"
                    className="flex-1 self-stretch h-auto flex items-center py-2.5 text-left appearance-none bg-transparent border-0 cursor-pointer outline-none"
                  >
                    {children}
                  </Button>
                  <Modal isDismissable className="h-full rounded-full bg-surface">
                    <Dialog className="h-full outline-none rounded-full bg-surface">
                      {modalContent}
                    </Dialog>
                  </Modal>
                </DialogTrigger>
              )
              : (
                children
              )}
          </>
        ),
      )}
    </AriaGridListItem>
  );
}
