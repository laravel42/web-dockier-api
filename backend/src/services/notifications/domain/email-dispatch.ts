import { Resend } from "resend";
import { env } from "../../../shared/config.js";

let resendClient: Resend | null = null;

function getResendClient(): Resend | null {
  if (!env.RESEND_API_KEY) return null;
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmailNotification(params: {
  to: string;
  title: string;
  message: string;
  idempotencyKey?: string;
}): Promise<boolean> {
  const resend = getResendClient();
  if (!resend) return false;

  const from = env.RESEND_FROM_EMAIL ?? "Dockier <onboarding@resend.dev>";
  const { error } = await resend.emails.send(
    {
      from,
      to: [params.to],
      subject: params.title,
      html: `<p>${escapeHtml(params.message)}</p>`,
      text: params.message,
    },
    params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : undefined,
  );

  return !error;
}
