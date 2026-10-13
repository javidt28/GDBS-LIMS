import { Empty, PageHeading } from "@/components/shell";
import { markNotificationAction } from "@/server/actions";
import { prisma } from "@/server/prisma";
import { requireClient } from "@/server/session";

export default async function NotificationsPage() {
  const user = await requireClient();
  const notes = await prisma.notification.findMany({ where: { clientUserId: user.id }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeading title="Notifications" />
      {notes.length === 0 ? <Empty>No notifications.</Empty> : (
        <ul className="stack">
          {notes.map((note) => (
            <li key={note.id} className="panel">
              <strong>{note.href ? <a href={note.href}>{note.title}</a> : note.title}</strong>
              <p>{note.body}</p>
              <p className="help">{note.createdAt.toISOString().slice(0, 16)} {note.readAt ? "· Read" : "· Unread"}</p>
              {!note.readAt && (
                <form action={markNotificationAction}>
                  <input type="hidden" name="id" value={note.id} />
                  <button className="btn" type="submit">Mark read</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
