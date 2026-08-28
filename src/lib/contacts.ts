/**
 * The Contact Picker API: Chrome on Android only. Safari on iOS has nothing
 * like it, and neither does any desktop browser — so every use of this is
 * behind a feature check, with the invite link as the path for everyone else.
 */
type ContactsManager = {
  select: (
    properties: string[],
    options?: { multiple?: boolean },
  ) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

export type PickedContact = { name: string; phone: string };

export function contactPickerAvailable(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'contacts' in navigator &&
    typeof (navigator as unknown as { contacts?: ContactsManager }).contacts?.select === 'function'
  );
}

/** Returns one entry per contact that actually had a number. */
export async function pickContacts(multiple = true): Promise<PickedContact[]> {
  const manager = (navigator as unknown as { contacts?: ContactsManager }).contacts;
  if (!manager) return [];

  const picked = await manager.select(['name', 'tel'], { multiple });
  return picked
    .map((contact) => ({
      name: contact.name?.[0]?.trim() ?? '',
      phone: contact.tel?.[0]?.trim() ?? '',
    }))
    .filter((c) => c.phone);
}
