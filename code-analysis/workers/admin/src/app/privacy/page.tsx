import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-prose space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p className="text-muted-foreground text-sm">
        This is placeholder copy for the admin template. Replace with your real
        privacy policy before production.
      </p>
      <p>
        <Link
          href="/login"
          className="text-primary underline underline-offset-4"
        >
          Back to login
        </Link>
      </p>
    </div>
  );
}
