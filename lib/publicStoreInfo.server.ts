export const PUBLIC_DISPATCH_HOURS = 'Open 24/7';

export async function loadPublishedDispatchHours(): Promise<string | null> {
  return PUBLIC_DISPATCH_HOURS;
}

export function getServiceHoursSchema(hours: string | null) {
  if (!hours || !/\b24\s*\/\s*7\b/i.test(hours)) return {};

  return {
    hoursAvailable: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        .map(day => `https://schema.org/${day}`),
      opens: '00:00',
      closes: '23:59',
    },
  };
}
