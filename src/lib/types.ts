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
};

export type AnswerKind = 'hosting' | 'guest';

/** What actually goes in the sheet. Everything else about an answer is derivable. */
export type StoredAnswer = {
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

export const TABS = {
  holidays: 'Holidays',
  households: 'Households',
  people: 'People',
  answers: 'Answers',
  conflicts: 'Conflicts',
} as const;

export const HEADERS = {
  holidays: ['holiday_key', 'name_he', 'type', 'date', 'year', 'include'],
  households: ['household_id', 'name', 'active'],
  people: ['phone', 'name', 'household_id'],
  answers: ['timestamp', 'holiday_key', 'kind', 'host_household_id', 'by_phone'],
  conflicts: ['holiday_key', 'household_id', 'host_household_id', 'host_kind', 'host_host_household_id', 'detected_at'],
} as const;
