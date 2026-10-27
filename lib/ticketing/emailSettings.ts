export interface TicketEmailSections {
  showEventCover: boolean;
  showEventTiming: boolean;
  showVenue: boolean;
  showDoors: boolean;
  showVenueAddress: boolean;
  showDirections: boolean;
  showFinancialSummary: boolean;
  showBuyerContact: boolean;
  showOrganizer: boolean;
  showEventDescription: boolean;
  showArrivalGuides: boolean;
  showCancellationPolicy: boolean;
  showTicketType: boolean;
  showAttendeeName: boolean;
}

export interface TicketEmailSettings {
  brandTitle: string;
  brandSubtitle: string;
  subjectTemplate: string;
  headingTemplate: string;
  introTemplate: string;
  closingTemplate: string;
  sections: TicketEmailSections;
}

export const DEFAULT_TICKET_EMAIL_SETTINGS: TicketEmailSettings = {
  brandTitle: 'APEX MARKET · TICKETING BY ONLINE BAR',
  brandSubtitle: 'Built in collaboration with the Apex Market team',
  subjectTemplate: 'Your tickets for {event_title} – {event_date}',
  headingTemplate: 'You’re in. Your ticket is ready.',
  introTemplate: 'Payment confirmed. Your printable tickets are attached. Save this email and present each ticket’s QR code at the entrance. Every ticket is valid for one scan.',
  closingTemplate: 'Keep your QR codes private. Each ticket is valid for one scan. If you cannot find your ticket, check your spam folder or open your ticket wallet to resend it.',
  sections: {
    showEventCover: true,
    showEventTiming: true,
    showVenue: true,
    showDoors: true,
    showVenueAddress: true,
    showDirections: true,
    showFinancialSummary: true,
    showBuyerContact: true,
    showOrganizer: true,
    showEventDescription: true,
    showArrivalGuides: true,
    showCancellationPolicy: true,
    showTicketType: true,
    showAttendeeName: true
  }
};

const allowedTemplateVariables = new Set([
  'event_title',
  'event_date',
  'buyer_name',
  'ticket_count',
  'order_reference',
  'amount_paid',
  'venue',
  'organizer_name'
]);

const textLimits: Record<keyof Omit<TicketEmailSettings, 'sections'>, number> = {
  brandTitle: 100,
  brandSubtitle: 180,
  subjectTemplate: 200,
  headingTemplate: 180,
  introTemplate: 1200,
  closingTemplate: 1200
};

export function isTicketEmailSettings(value: unknown): value is TicketEmailSettings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const sections = candidate.sections;
  if (typeof sections !== 'object' || sections === null || Array.isArray(sections)) return false;
  const sectionValues = sections as Record<string, unknown>;
  return (Object.keys(textLimits) as Array<keyof typeof textLimits>).every(key =>
    typeof candidate[key] === 'string'
      && (candidate[key] as string).length <= textLimits[key]
  ) && Object.keys(DEFAULT_TICKET_EMAIL_SETTINGS.sections).every(key =>
    typeof sectionValues[key] === 'boolean'
  ) && Object.values(candidate)
    .filter((entry): entry is string => typeof entry === 'string')
    .every(template => [...template.matchAll(/\{([^{}]+)\}/g)].every(match =>
      allowedTemplateVariables.has(match[1])
    ));
}

export function normalizeTicketEmailSettings(value: unknown): TicketEmailSettings | null {
  if (!isTicketEmailSettings(value)) return null;
  return {
    brandTitle: value.brandTitle.trim(),
    brandSubtitle: value.brandSubtitle.trim(),
    subjectTemplate: value.subjectTemplate.trim(),
    headingTemplate: value.headingTemplate.trim(),
    introTemplate: value.introTemplate.trim(),
    closingTemplate: value.closingTemplate.trim(),
    sections: { ...value.sections }
  };
}

export function renderTicketEmailTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    key in variables ? variables[key] : match
  );
}
