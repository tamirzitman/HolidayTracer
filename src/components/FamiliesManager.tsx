'use client';

import { useState } from 'react';
import {
  addAllSuggested,
  addSuggested,
  dismissSuggested,
  dropCircle,
  editCircleMembers,
  makeCircle,
  nameCircle,
  newInviteLink,
  type ActionResult,
} from '@/app/actions';
import { useActionState } from 'react';
import { ContactPicker } from './ContactPicker';
import { WhatsAppMark, type Member } from './WhatsApp';
import { inviteText } from '@/lib/whatsapp';
import {
  ErrorNote,
  Title,
  card,
  chipButton,
  field,
  primaryButton,
  quietButton,
  secondaryButton,
} from './ui';

type Family = { id: string; name: string; members: Member[] };

export function FamiliesManager({
  circles,
  suggested,
  everyone,
}: {
  circles: { id: string; name: string; families: Family[] }[];
  /** Circles your families sit in and you don't, with how many of them are in each. */
  suggested: { id: string; name: string; seenBy: number }[];
  /** Every family you know, for adding one to a circle it is not in yet. */
  everyone: { id: string; name: string }[];
}) {
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<'family' | 'household' | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  // Which circle the link joins. Two sides of a family never sit together and
  // do not share a group chat, so an invite to one is not an invite to the other.
  const [circleId, setCircleId] = useState(circles[0]?.id ?? '');
  const [, createAction] = useActionState<ActionResult, FormData>(makeCircle, {});

  async function makeLink(kind: 'family' | 'household') {
    setBusy(kind);
    try {
      const token = await newInviteLink(kind, circleId);
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col items-center gap-2 text-center">
        <Title>המעגלים שלי</Title>
        <p className="text-muted">רק המשפחות שכאן מופיעות כשאתם עונים על חג.</p>
      </header>

      {circles.length === 0 ? (
        <section className={`${card} p-6 text-center text-muted`}>
          עדיין אין אף משפחה. הזמינו מישהו למטה.
        </section>
      ) : (
        circles.map((circle) => (
          <CircleCard
            key={circle.id}
            circle={circle}
            circles={circles.map((c) => ({ id: c.id, name: c.name }))}
            everyone={everyone}
          />
        ))
      )}

      {/* A circle is the thing you build; making one should not be buried. */}
      <form action={createAction} className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold text-ink">מעגל חדש</h2>
        <p className="text-sm text-muted">
          צד אחד של המשפחה הוא מעגל, והצד השני הוא מעגל אחר. הם לא נפגשים ולא
          חולקים קבוצה.
        </p>
        <input name="name" type="text" required placeholder="המשפחה של אבא" className={field} />
        <button type="submit" className={secondaryButton}>
          יצירת מעגל
        </button>
      </form>

      {/* Circles drift apart as people add families of their own. Rather than ask
          anyone to keep the lists in step, this reads the overlap off the
          connections that already exist. */}
      {suggested.length > 0 && (
        <section className={`${card} flex flex-col gap-1 p-0`}>
          <div className="flex items-baseline justify-between gap-2 px-5 pt-4 pb-1">
            <h2 className="text-sm font-bold text-muted">מוצע להוספה</h2>
            {/* The case a parent's invitation makes: their list is all of yours,
                and taking it one row at a time is work for nothing. */}
            {suggested.length > 1 && (
              <button
                type="button"
                disabled={adding !== null}
                onClick={async () => {
                  setAdding('all');
                  try {
                    await addAllSuggested();
                  } finally {
                    setAdding(null);
                  }
                }}
                className="shrink-0 text-xs font-bold text-brand underline underline-offset-4"
              >
                {adding === 'all' ? 'רגע…' : 'הוספת כולן'}
              </button>
            )}
          </div>
          <ul className="divide-y divide-line">
            {suggested.map((family) => (
              <li key={family.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 grow">
                  <p className="truncate font-semibold text-ink">{family.name}</p>
                  <p className="text-sm text-muted">
                    {family.seenBy === 1
                      ? 'משפחה אחת שלכם רואה אותם'
                      : `${family.seenBy} מהמשפחות שלכם רואות אותם`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    disabled={adding === family.id}
                    onClick={async () => {
                      setAdding(family.id);
                      try {
                        await addSuggested(family.id);
                      } finally {
                        setAdding(null);
                      }
                    }}
                    className={chipButton}
                  >
                    {adding === family.id ? 'רגע…' : 'הוספה'}
                  </button>
                  {/* Turned down for good. Without this the families you have
                      decided against are exactly the ones that keep coming
                      back, because your families keep vouching for them. */}
                  <button
                    type="button"
                    disabled={adding === family.id}
                    aria-label={`להסיר את ${family.name} מההצעות`}
                    title="לא להציע שוב"
                    onClick={async () => {
                      setAdding(family.id);
                      try {
                        await dismissSuggested(family.id);
                      } finally {
                        setAdding(null);
                      }
                    }}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition active:scale-95"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={`${card} flex flex-col gap-3`}>
        <h2 className="font-display text-xl font-bold text-ink">הזמנה</h2>
        <p className="text-sm text-muted">
          שולחים קישור בוואטסאפ. מי שפותח אותו מתחבר אליכם — גם אם הוא כבר באפליקציה.
        </p>

        {!link && (
          <label className="flex flex-col gap-2">
            <span className="text-sm font-semibold text-muted">לאיזה מעגל?</span>
            <select
              name="circleId"
              value={circleId}
              onChange={(e) => setCircleId(e.target.value)}
              className={field}
            >
              {circles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted">
              מי שנכנס דרך הקישור מצטרף למעגל הזה. הצד השני של המשפחה הוא מעגל אחר,
              עם קישור משלו.
            </span>
          </label>
        )}

        {link ? (
          <>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(inviteText(link))}`}
              target="_blank"
              rel="noreferrer"
              className={`${primaryButton} inline-flex items-center justify-center gap-2`}
            >
              <WhatsAppMark />
              שליחה בוואטסאפ
            </a>
            <button type="button" onClick={copy} className={secondaryButton}>
              {copied ? 'הקישור הועתק ✓' : 'העתקת הקישור'}
            </button>
            <button type="button" onClick={() => setLink('')} className={quietButton}>
              קישור אחר
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => makeLink('family')}
              disabled={busy !== null}
              className={primaryButton}
            >
              {busy === 'family' ? 'רגע…' : 'הזמנת משפחה'}
            </button>
            {/*
              A second button here made a household invite — attaching a spouse or
              a grown child to *your* house instead of opening a new one. It earned
              too little for the room it took, so it is off the screen; the kind is
              still carried end to end (newInviteLink → readInvite → register), so
              putting it back is this button again and nothing else:

              <button type="button" onClick={() => makeLink('household')}
                disabled={busy !== null} className={secondaryButton}>
                {busy === 'household' ? 'רגע…' : 'הזמנה לבית שלנו'}
              </button>
            */}
            <p className="text-center text-xs text-muted">
              כל מי שנכנס דרך הקישור פותח משפחה משלו, ומתחבר אליכם.
            </p>

            <div className="mt-1 border-t border-line pt-3">
              <ContactPicker />
            </div>
          </>
        )}
      </div>

    </div>
  );
}

/**
 * One circle: its name, who is in it, and everything you do to it.
 *
 * Ticking is the whole interaction — the checkboxes are client state, so they
 * answer instantly, and one press at the end writes the lot in a single block.
 * Removing eight families used to be eight round trips through the sheet.
 */
function CircleCard({
  circle,
  circles,
  everyone,
}: {
  circle: { id: string; name: string; families: Family[] };
  /** Every circle we are in, so a family can be moved to one of the others. */
  circles: { id: string; name: string }[];
  everyone: { id: string; name: string }[];
}) {
  const [, renameAction] = useActionState<ActionResult, FormData>(nameCircle, {});
  const [membersState, membersAction] = useActionState<ActionResult, FormData>(
    editCircleMembers,
    {},
  );
  const [dropState, dropAction] = useActionState<ActionResult, FormData>(dropCircle, {});
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [adding, setAdding] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const outside = everyone.filter((h) => !circle.families.some((f) => f.id === h.id));
  const elsewhere = circles.filter((c) => c.id !== circle.id);

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  // A tick left standing after the families have changed underneath it would
  // act on somebody nobody chose.
  function done() {
    setPicked([]);
    setAdding([]);
    setConfirming(false);
  }

  return (
    <section className={`${card} flex flex-col gap-1 p-0`}>
      <div className="flex items-center gap-2 px-5 pt-4 pb-1">
        <h2 className="grow text-sm font-bold text-muted">{circle.name}</h2>
        <button
          type="button"
          onClick={() => {
            setEditing(!editing);
            done();
          }}
          className={chipButton}
        >
          {editing ? 'סיום' : 'עריכה'}
        </button>
      </div>

      {editing && (
        <form action={renameAction} className="flex gap-2 px-5 pb-3">
          <input type="hidden" name="circleId" value={circle.id} />
          <input
            name="name"
            defaultValue={circle.name}
            className={`${field} grow`}
            aria-label="שם המעגל"
          />
          <button type="submit" className={chipButton}>
            שמירה
          </button>
        </form>
      )}

      <ul className="divide-y divide-line">
        {circle.families.map((family) => (
          <li key={family.id} className="flex items-center gap-3 px-5 py-3.5">
            {editing && (
              <input
                type="checkbox"
                checked={picked.includes(family.id)}
                onChange={() => setPicked(toggle(picked, family.id))}
                aria-label={`בחירת ${family.name}`}
                className="h-5 w-5 shrink-0 accent-brand"
              />
            )}
            <div className="min-w-0 grow">
              <p className="truncate font-semibold text-ink">{family.name}</p>
              <span className="text-sm text-muted">
                {family.members.length === 0
                  ? 'עוד לא נרשמו לאפליקציה'
                  : family.members.map((m) => m.name).join(', ')}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Everything that acts on a tick sits in one place, and only while
          something is ticked. */}
      {editing && picked.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line bg-brand-wash px-5 py-3">
          <p className="text-xs font-bold text-muted">{picked.length} נבחרו</p>
          <div className="flex flex-wrap items-center gap-2">
            <form action={membersAction} onSubmit={done}>
              <input type="hidden" name="circleId" value={circle.id} />
              <input type="hidden" name="op" value="remove" />
              {picked.map((id) => (
                <input key={id} type="hidden" name="householdId" value={id} />
              ))}
              <button type="submit" className={quietButton}>
                הסרה מהמעגל
              </button>
            </form>

            {elsewhere.length > 0 && (
              <form action={membersAction} onSubmit={done} className="flex grow gap-2">
                <input type="hidden" name="circleId" value={circle.id} />
                <input type="hidden" name="op" value="move" />
                {picked.map((id) => (
                  <input key={id} type="hidden" name="householdId" value={id} />
                ))}
                <select
                  name="toCircleId"
                  defaultValue={elsewhere[0].id}
                  aria-label="העברה למעגל"
                  className={`${field} grow`}
                >
                  {elsewhere.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className={chipButton}>
                  העברה
                </button>
              </form>
            )}
          </div>
          <ErrorNote>{membersState.error}</ErrorNote>
        </div>
      )}

      {/* Adding is the same interaction the other way round: tick, then press
          once, however many you ticked. */}
      {editing && outside.length > 0 && (
        <form
          action={membersAction}
          onSubmit={done}
          className="flex flex-col gap-2 border-t border-line px-5 py-3"
        >
          <input type="hidden" name="circleId" value={circle.id} />
          <input type="hidden" name="op" value="add" />
          <p className="text-xs font-bold text-muted">הוספה למעגל</p>
          <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto">
            {outside.map((h) => (
              <li key={h.id}>
                <label className="flex items-center gap-3 py-1">
                  <input
                    type="checkbox"
                    name="householdId"
                    value={h.id}
                    checked={adding.includes(h.id)}
                    onChange={() => setAdding(toggle(adding, h.id))}
                    className="h-5 w-5 shrink-0 accent-brand"
                  />
                  <span className="min-w-0 truncate text-sm text-ink">{h.name}</span>
                </label>
              </li>
            ))}
          </ul>
          <button type="submit" disabled={adding.length === 0} className={chipButton}>
            {adding.length > 1 ? `הוספת ${adding.length} משפחות` : 'הוספה'}
          </button>
        </form>
      )}

      {/* Last, and asked about: a circle is deleted for everyone in it, not
          only for us. */}
      {editing && (
        <div className="border-t border-line px-5 py-3">
          {confirming ? (
            <form action={dropAction} onSubmit={done} className="flex flex-col gap-2">
              <input type="hidden" name="circleId" value={circle.id} />
              <p className="text-sm text-ink">
                למחוק את «{circle.name}»? המעגל ייעלם אצל כל מי שבו. המשפחות עצמן
                נשארות, וגם בכל מעגל אחר שהן בו.
              </p>
              <div className="flex gap-2">
                <button type="submit" className={quietButton}>
                  כן, למחוק
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={chipButton}>
                  ביטול
                </button>
              </div>
              <ErrorNote>{dropState.error}</ErrorNote>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs font-bold text-muted underline underline-offset-4"
            >
              מחיקת המעגל
            </button>
          )}
        </div>
      )}
    </section>
  );
}
