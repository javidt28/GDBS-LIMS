import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { staffSignInAction } from "@/server/actions";
import { getStaff } from "@/server/session";

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getStaff()) redirect("/internal");
  const query = await searchParams;
  return (
    <AuthShell
      variant="staff"
      title="Staff sign in"
      subtitle="Employee accounts are created by an administrator. Public registration does not create a staff account."
      error={query.error}
      footer={<p>Not a GDBS employee? <Link href="/sign-in">Client sign in</Link></p>}
    >
      <form action={staffSignInAction} className="auth-form">
        <label>Work email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn auth-submit" type="submit">Sign in</button>
      </form>
    </AuthShell>
  );
}
