export type Household = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
};

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
  hebrewDate: string;
  hebrewYear: string;
  include: boolean;
};

export type AnswerKind = 'hosting' | 'guest';

export type Answer = {
  timestamp: string;
  hebrewYear: string;
  holidayKey: string;
  holidayName: string;
  byPhone: string;
  householdId: string;
  householdName: string;
  kind: AnswerKind;
  hostHouseholdId: string;
  hostHouseholdName: string;
};

export const TABS = {
  holidays: 'Holidays',
  households: 'Households',
  people: 'People',
  answers: 'Answers',
  conflicts: 'Conflicts',
} as const;
