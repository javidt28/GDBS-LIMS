import { PublicFooter, PublicHeader } from "@/components/public-frame";
import { Banner } from "@/components/shell";
import { forgotPasswordAction, registerAction, resetPasswordAction, signInAction, verifyEmailAction } from "@/server/actions";

function AuthPage({ title, children, error, ok }: { title: string; children: React.ReactNode; error?: string; ok?: string }) {
  return (
    <>
      <PublicHeader />
      <main id="content" className="section" style={{ maxWidth: "32rem" }}>
        <h1 className="page-title">{title}</h1>
        <Banner error={error} ok={ok} />
        {children}
      </main>
      <PublicFooter />
    </>
  );
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string; reset?: string }> }) {
  const query = await searchParams;
  return (
    <AuthPage title="Sign in" error={query.error} ok={query.verified ? "Email verified. You can sign in." : query.reset ? "Password updated. You can sign in." : undefined}>
      <form action={signInAction} className="stack">
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="btn btn-primary" type="submit">Sign in</button>
        <a href="/forgot-password">Forgot password</a>
      </form>
    </AuthPage>
  );
}

export async function CreateAccountPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; devToken?: string }> }) {
  const query = await searchParams;
  return (
    <AuthPage
      title="Create account"
      error={query.error}
      ok={query.sent ? "Account created. Verify your email before signing in." : undefined}
    >
      {query.devToken && (
        <p className="banner-ok">No email provider is configured. Development verification link: <a href={`/verify-email?token=${query.devToken}`}>Verify email</a></p>
      )}
      <form action={registerAction} className="stack">
        <label>Full name<input name="fullName" required autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" /></label>
        <label>Password<span className="help">At least 12 characters.</span><input name="password" type="password" required autoComplete="new-password" minLength={12} /></label>
        <button className="btn btn-primary" type="submit">Create account</button>
      </form>
    </AuthPage>
  );
}

export async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <AuthPage title="Verify email" error={query.error}>
      <form action={verifyEmailAction} className="stack">
        <input type="hidden" name="token" value={query.token ?? ""} />
        <button className="btn btn-primary" type="submit">Verify email</button>
      </form>
    </AuthPage>
  );
}

export async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; devToken?: string }> }) {
  const query = await searchParams;
  return (
    <AuthPage title="Reset password" ok={query.sent ? "If an account exists for that email, a reset link has been prepared." : undefined}>
      {query.devToken && <p className="banner-ok">Development reset link: <a href={`/reset-password?token=${query.devToken}`}>Reset password</a></p>}
      <form action={forgotPasswordAction} className="stack">
        <label>Email<input name="email" type="email" required /></label>
        <button className="btn btn-primary" type="submit">Send reset link</button>
      </form>
    </AuthPage>
  );
}

export async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <AuthPage title="Choose a new password" error={query.error}>
      <form action={resetPasswordAction} className="stack">
        <input type="hidden" name="token" value={query.token ?? ""} />
        <label>New password<input name="password" type="password" minLength={12} required /></label>
        <button className="btn btn-primary" type="submit">Update password</button>
      </form>
    </AuthPage>
  );
}
