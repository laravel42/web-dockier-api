import { toast as sonnerToast } from "sonner";

type ToastOptions = {
  title?: React.ReactNode;
  description?: React.ReactNode;
  variant?: "default" | "destructive";
};

export function toast({
  title,
  description,
  variant = "default",
}: ToastOptions) {
  if (variant === "destructive") {
    return sonnerToast.error(title, { description });
  }

  return sonnerToast(title, { description });
}
