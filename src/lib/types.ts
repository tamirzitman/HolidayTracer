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

/** Keys only. Names live in Households; by_phone points at a row in People. */
export type Answer = {
  timestamp: string;
  year: string;
  holidayKey: string;
  householdId: string;
  kind: AnswerKind;
  hostHouseholdId: string;
  byPhone: string;
};

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
  answers: ['timestamp', 'year', 'holiday_key', 'household_id', 'kind', 'host_household_id', 'by_phone'],
  conflicts: ['holiday_key', 'household_id', 'host_household_id', 'host_kind', 'host_host_household_id', 'detected_at'],
} as const;
