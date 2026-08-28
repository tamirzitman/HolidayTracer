export type Household = {
  id: string;
  name: string;
  /** Whose number to call. Points at a row in People — never a copy of the number. */
  contactPersonId: string;
  active: boolean;
};

export type Person = {
  id: string;
  phone: string;
  name: string;
  householdId: string;
};

export type Holiday = {
  key: string;
  nameHe: string;
  type: string;
  date: string; // YYYY-MM-DD
  hebrewDate: string;
  year: string; // Gregorian
  include: boolean;
};

export type AnswerKind = 'hosting' | 'guest';

/** Ids only. Names live in Households, numbers live in People. */
export type Answer = {
  timestamp: string;
  year: string;
  holidayKey: string;
  householdId: string;
  kind: AnswerKind;
  hostHouseholdId: string;
  byPersonId: string;
};

export const TABS = {
  holidays: 'Holidays',
  households: 'Households',
  people: 'People',
  answers: 'Answers',
  conflicts: 'Conflicts',
} as const;

export const HEADERS = {
  holidays: ['holiday_key', 'name_he', 'type', 'date', 'hebrew_date', 'year', 'include'],
  households: ['household_id', 'name', 'contact_person_id', 'active'],
  people: ['person_id', 'phone', 'name', 'household_id'],
  answers: ['timestamp', 'year', 'holiday_key', 'household_id', 'kind', 'host_household_id', 'by_person_id'],
  conflicts: ['holiday_key', 'household_id', 'host_household_id', 'host_kind', 'host_host_household_id', 'detected_at'],
} as const;
