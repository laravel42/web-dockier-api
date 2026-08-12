import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-prose space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p className="text-muted-foreground text-sm">
        This is placeholder copy for the admin template. Replace with your real
        terms before production.
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
