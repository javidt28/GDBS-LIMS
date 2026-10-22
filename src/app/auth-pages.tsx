import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { forgotPasswordAction, registerAction, resetPasswordAction, signInAction, verifyEmailAction } from "@/server/actions";
import { getClient } from "@/server/session";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; verified?: string; reset?: string }> }) {
  if (await getClient()) redirect("/portal");
  const query = await searchParams;
  return (
    <AuthShell
      title="Sign in"
      subtitle="Use the email and password for your client account."
      error={query.error}
      ok={query.verified ? "Email verified. You can sign in." : query.reset ? "Password updated. You can sign in." : undefined}
      footer={
        <>
          <p>New to the portal? <Link href="/create-account">Create an account</Link></p>
          <p>GDBS employee? <Link href="/internal/sign-in">Staff sign in</Link></p>
        </>
      }
    >
      <form action={signInAction} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="username" placeholder="you@example.com" required /></label>
        <div className="auth-field">
          <div className="auth-label-row">
            <label htmlFor="sign-in-password">Password</label>
            <Link href="/forgot-password">Forgot password?</Link>
          </div>
          <input id="sign-in-password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn auth-submit" type="submit">Sign in</button>
      </form>
    </AuthShell>
  );
}

export async function CreateAccountPage({ searchParams }: { searchParams: Promise<{ error?: string; sent?: string; devToken?: string }> }) {
  const query = await searchParams;
  return (
    <AuthShell
      title="Create your account"
      subtitle="Register once to request testing and collect your reports."
      error={query.error}
      ok={query.sent ? "Account created. Check your email for a verification link before signing in." : undefined}
      footer={<p>Already registered? <Link href="/sign-in">Sign in</Link></p>}
    >
      {query.devToken && (
        <p className="banner-ok">No email provider is configured. Development verification link: <a href={`/verify-email?token=${query.devToken}`}>Verify email</a></p>
      )}
      <form action={registerAction} className="auth-form">
        <label>Full name<input name="fullName" required autoComplete="name" /></label>
        <label>Email<input name="email" type="email" required autoComplete="email" placeholder="you@example.com" /></label>
        <label>
          Password
          <input name="password" type="password" required autoComplete="new-password" minLength={12} />
          <span className="help">At least 12 characters.</span>
        </label>
        <button className="btn auth-submit" type="submit">Create account</button>
      </form>
    </AuthShell>
  );
}

export async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirm this address to finish setting up your client account."
      error={query.error}
      footer={<p><Link href="/sign-in">Back to sign in</Link></p>}
    >
      <form action={verifyEmailAction} className="auth-form">
        <input type="hidden" name="token" value={query.token ?? ""} />
        <button className="btn auth-submit" type="submit">Verify email</button>
      </form>
    </AuthShell>
  );
}

export async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ sent?: string; devToken?: string }> }) {
  const query = await searchParams;
  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we will send a link to choose a new password."
      ok={query.sent ? "If an account exists for that email, a reset link has been sent." : undefined}
      footer={<p>Remembered it? <Link href="/sign-in">Sign in</Link></p>}
    >
      {query.devToken && <p className="banner-ok">Development reset link: <a href={`/reset-password?token=${query.devToken}`}>Reset password</a></p>}
      <form action={forgotPasswordAction} className="auth-form">
        <label>Email<input name="email" type="email" autoComplete="email" placeholder="you@example.com" required /></label>
        <button className="btn auth-submit" type="submit">Send reset link</button>
      </form>
    </AuthShell>
  );
}

export async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <AuthShell
      title="Choose a new password"
      error={query.error}
      footer={<p><Link href="/sign-in">Back to sign in</Link></p>}
    >
      <form action={resetPasswordAction} className="auth-form">
        <input type="hidden" name="token" value={query.token ?? ""} />
        <label>
          New password
          <input name="password" type="password" autoComplete="new-password" minLength={12} required />
          <span className="help">At least 12 characters.</span>
        </label>
        <button className="btn auth-submit" type="submit">Update password</button>
      </form>
    </AuthShell>
  );
}
