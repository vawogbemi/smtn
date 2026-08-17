import { ReactNode } from "react";
import { Dialog, DialogTrigger } from "react-aria-components";
import { IconArrowsDiagonal } from "@tabler/icons-react";
import { Button } from "./Button";
import { Modal } from "./GridList";

// A titled panel whose contents can be blown up into a modal. `children` is
// rendered in both places, so anything with internal state (selection, scroll)
// keeps a separate copy in the modal.
export const Card = ({
  title,
  children,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section
    className={`w-full flex flex-col min-h-0 rounded-xl border border-border bg-surface overflow-hidden ${className}`}
  >
    <header className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border shrink-0">
      <p className="font-semibold text-sm text-text-primary truncate">
        {title}
      </p>
      <DialogTrigger>
        <Button
          variant="quiet"
          aria-label="Expand"
          className="rounded-full shrink-0"
        >
          <IconArrowsDiagonal className="h-4 w-4" />
        </Button>
        <Modal isDismissable className="h-full">
          <Dialog className="h-full outline-none">
            <div className="w-full h-full min-h-64 bg-surface p-4 md:p-6 flex flex-col gap-3">
              <p className="font-semibold text-lg md:text-2xl text-text-primary">
                {title}
              </p>
              <div className="flex-1 min-h-0 flex flex-col">{children}</div>
            </div>
          </Dialog>
        </Modal>
      </DialogTrigger>
    </header>
    <div className="flex-1 min-h-0 flex flex-col">{children}</div>
  </section>
);

export default Card;
