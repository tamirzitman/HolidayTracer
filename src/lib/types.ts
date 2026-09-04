export type Household = {
  id: string;
  name: string;
  active: boolean;
};

/** The phone number is the key. There is no second id. */
export type Person = {
  phone: string;
  name: string;
  householdId: string;
};

export type Holiday = {
  key: string;
  nameHe: string;
  type: string;
  date: string; // YYYY-MM-DD
  year: string; // Gregorian
  include: boolean;
  /**
   * The mark shown beside the holiday. Read from the sheet, so it can be changed
   * without a deploy; empty falls back to the one the code knows for this kind,
   * and an unknown kind falls back again to a plain ✨.
   */
  emoji: string;
  /** Empty for the seeded holidays everyone shares; set for one family's own occasion. */
  ownerHouseholdId: string;
  /**
   * Households the owner shares this occasion with, besides itself. An occasion
   * nobody else can see is one nobody else can answer about, which makes it
   * useless for the gatherings these mostly are — so this is normally the
   * owner's whole circle, and empty only when they deliberately kept it theirs.
   */
  sharedWith: string[];
};

/** away — not gathering at all this holiday: no host, no guests. */
export type AnswerKind = 'hosting' | 'guest' | 'away';

/** What actually goes in the sheet. Everything else about an answer is derivable. */
export type StoredAnswer = {
  /**
   * Set only when the answer was recorded for a household by somebody outside
   * it — a guest saying they are coming implies their host is hosting. Empty on
   * every ordinary row, where the household follows from the phone.
   */
  forHouseholdId: string;
  timestamp: string;
  holidayKey: string;
  kind: AnswerKind;
  hostHouseholdId: string;
  byPhone: string;
};

/**
 * A stored answer plus the household it belongs to, worked out from by_phone
 * through People. Not a column: the year is in Holidays, and the household is in
 * People, so neither is repeated here.
 */
export type Answer = StoredAnswer & { householdId: string };

/**
 * A directed row: "I can see them". Adding a family writes both directions;
 * hiding one writes a remove event for your side only, so the other family is
 * never silently cut off.
 *
 * Append-only like the answers, because a tab that gets rewritten can lose rows
 * when two people act at the same moment.
 */
export type Connection = {
  householdId: string;
  connectedTo: string;
  /**
   *  - `add`         on each other's lists
   *  - `remove`      hidden: turned down as a suggestion, so it is not offered again
   *  - `reconsider`  the hiding undone — not connected, but suggestible once more
   *
   * `reconsider` exists because hiding must not be a one-way door. Appending an
   * `add` to undo it would connect two families that were only ever suggested,
   * which is a different thing entirely.
   */
  action: 'add' | 'remove' | 'reconsider';
  at: string;
};

/**
 * A link, because nobody types phone numbers. Two kinds:
 *   family    — the opener names a new household, connected to the inviter
 *   household — the opener joins the inviter's own household (a spouse, a grown child)
 * Reusable: one link can go in a WhatsApp group and bring in several families.
 */
export type Invite = {
  token: string;
  createdBy: string;
  kind: 'family' | 'household';
  createdAt: string;
  /**
   * The number this link was made for, when it was made for one person. A link
   * aimed at somebody is spent the moment they use it; a general one is not,
   * because a link in a family group has to bring in more than one household —
   * and an invitation to our own house may be meant for a partner *and* a
   * grown child.
   */
  forPhone: string;
  /** When a personal link was used up. Empty while it still works. */
  usedAt: string;
};

export const TABS = {
  holidays: 'Holidays',
  households: 'Households',
  people: 'People',
  answers: 'Answers',
  conflicts: 'Conflicts',
  connections: 'Connections',
  invites: 'Invites',
} as const;

export const HEADERS = {
  holidays: [
    'holiday_key', 'name_he', 'type', 'date', 'year', 'include',
    'owner_household_id', 'shared_with', 'emoji',
  ],
  households: ['household_id', 'name', 'active'],
  people: ['phone', 'name', 'household_id'],
  answers: [
    'timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone', 'for_household_id',
  ],
  conflicts: ['holiday_key', 'household_id', 'host_household_id', 'status', 'at'],
  connections: ['household_id', 'connected_to', 'action', 'at'],
  invites: ['token', 'created_by', 'kind', 'created_at', 'for_phone', 'used_at'],
} as const;
