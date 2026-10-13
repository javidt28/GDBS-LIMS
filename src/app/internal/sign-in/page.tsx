import { PublicFooter, PublicHeader } from "@/components/public-frame";
import { Banner } from "@/components/shell";
import { staffSignInAction } from "@/server/actions";

export default async function StaffSignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  return (
    <>
      <PublicHeader />
      <main id="content" className="section" style={{ maxWidth: "32rem" }}>
        <h1 className="page-title">Staff sign in</h1>
        <p className="help">Employee accounts are created by an administrator. Public registration does not create a staff account.</p>
        <Banner error={query.error} />
        <form action={staffSignInAction} className="stack">
          <label>Email<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="btn btn-primary" type="submit">Sign in</button>
        </form>
      </main>
      <PublicFooter />
    </>
  );
}
