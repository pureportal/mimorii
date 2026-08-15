import { LoaderCircle } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Dialog, DialogContent, DialogHeader } from "./dialog";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonProps["variant"];
  pending?: boolean;
  onConfirm: () => void;
}

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  confirmVariant = "danger",
  pending = false,
  onConfirm,
}: ConfirmationDialogProps) {
  const setOpen = (nextOpen: boolean) => {
    if (!pending) onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        role="alertdialog"
        className="max-w-md"
        closeDisabled={pending}
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <DialogHeader title={title}>{description}</DialogHeader>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            autoFocus
            onClick={() => setOpen(false)}
          >
            {cancelLabel}
          </Button>
          <Button type="button" variant={confirmVariant} disabled={pending} onClick={onConfirm}>
            {pending ? <LoaderCircle className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
