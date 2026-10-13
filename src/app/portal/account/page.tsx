import { Banner, PageHeading } from "@/components/shell";
import { accountAction } from "@/server/actions";
import { requireClient } from "@/server/session";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const user = await requireClient();
  const query = await searchParams;
  return (
    <>
      <PageHeading title="Account" />
      <Banner error={query.error} ok={query.saved ? "Profile saved." : undefined} />
      <form action={accountAction} className="stack" style={{ maxWidth: "36rem" }}>
        <label>Account type
          <select name="kind" defaultValue={user.account.kind}>
            <option value="INDIVIDUAL">Individual</option>
            <option value="ORGANIZATION">Organization</option>
          </select>
        </label>
        <label>Your name<input name="fullName" required defaultValue={user.fullName} /></label>
        <label>Client name<input name="name" required defaultValue={user.account.name} /></label>
        <label>Contact person<input name="contactPerson" defaultValue={user.account.contactPerson ?? ""} /></label>
        <label>Address<textarea name="address" defaultValue={user.account.address ?? ""} /></label>
        <label>Contact number<input name="contactNo" defaultValue={user.account.contactNo ?? ""} /></label>
        <p className="help">Email {user.email} is the sign-in address. Password changes use the reset link on the sign-in page.</p>
        <button className="btn btn-primary" type="submit">Save</button>
      </form>
    </>
  );
}
