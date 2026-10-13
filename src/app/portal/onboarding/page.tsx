import { redirect } from "next/navigation";
import { Banner } from "@/components/shell";
import { profileAction } from "@/server/actions";
import { requireClient } from "@/server/session";

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireClient();
  const query = await searchParams;
  if (user.account.profileCompletedAt) redirect("/portal");
  return (
    <>
      <h1 className="page-title" style={{ fontSize: "1.7rem" }}>Client profile</h1>
      <p>This is the first step after email verification. You can enter the portal when the profile is saved. A service request is not required yet.</p>
      <Banner error={query.error} />
      <form action={profileAction} className="stack" style={{ maxWidth: "36rem" }}>
        <label>Account type
          <select name="kind" defaultValue="INDIVIDUAL">
            <option value="INDIVIDUAL">Individual</option>
            <option value="ORGANIZATION">Organization</option>
          </select>
        </label>
        <label>Your name<input name="fullName" required defaultValue={user.fullName} /></label>
        <label>Client name<span className="help">The name that will appear on Form GDBS-QMF-004.</span><input name="name" required defaultValue={user.account.name} /></label>
        <label>Contact person<input name="contactPerson" defaultValue={user.account.contactPerson ?? ""} /></label>
        <label>Address<textarea name="address" defaultValue={user.account.address ?? ""} /></label>
        <label>Contact number<input name="contactNo" defaultValue={user.account.contactNo ?? ""} /></label>
        <button className="btn btn-primary" type="submit">Save and continue</button>
      </form>
    </>
  );
}
