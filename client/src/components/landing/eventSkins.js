// Per-event looks for the event card. An event listed here keeps every part of the card
// (details, chips, prices, buttons) and only changes how it looks: its own logo in place of
// the name, its colours and its type. Events not listed keep the standard card.
export const EVENT_SKINS = {
  // Kolkata Comics Karnival 7.0: black and orange with a yellow price burst, as on its banner.
  'kolkata-comics-karnival-7-0': {
    logo: '/events/kolkata-comics-karnival-7-0/kck7-logo.png',
    watermarkLogo: null,
    mainBgImage: '/events/kolkata-comics-karnival-7-0/comic-bg.jpg',
    stubImage: '/events/kolkata-comics-karnival-7-0/stub-bg.jpg',
    tagline: ['Comics', 'Gaming', 'Collectibles', 'Cosplay'],
    colors: {
      ink: '#0A0A0A',      // banner black
      orange: '#06B6D4',   // Kamehameha cyan blue accent (matches Master Roshi orb)
      burst: '#F2FF00',    // price starburst
      button: '#FFC21A',   // "Book tickets" button
      red: '#E10600'       // edition number
    }
  }
};

export const skinFor = (evOrId) => {
  if (!evOrId) return null;
  if (typeof evOrId === 'string') return EVENT_SKINS[evOrId] || null;
  const preset = EVENT_SKINS[evOrId.eventId] || null;
  const tpl = evOrId.cardTemplate;
  if (tpl?.layout === 'kolkata-dusk') {
    return {
      logo: tpl.logoUrl || preset?.logo || null,
      watermarkLogo: tpl.watermarkUrl || preset?.watermarkLogo || null,
      mainBgImage: preset?.mainBgImage || null,
      stubImage: preset?.stubImage || null,
      tagline: tpl.tagline?.length ? tpl.tagline : (preset?.tagline || []),
      colors: {
        ink: '#0A0A0A',
        orange: '#FF7A1A',
        burst: '#F2FF00',
        button: '#FFC21A',
        red: '#E10600',
        ...(preset?.colors || {}),
        ...(tpl.colors || {})
      }
    };
  }
  if (tpl?.layout === 'standard') return null;
  return preset;
};
