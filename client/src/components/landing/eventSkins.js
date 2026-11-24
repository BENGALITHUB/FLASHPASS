// Per-event looks for the event card. An event listed here keeps every part of the card
// (details, chips, prices, buttons) and only changes how it looks: its own logo in place of
// the name, its colours and its type. Events not listed keep the standard card.
export const EVENT_SKINS = {
  // Kolkata Comics Karnival 7.0: black and orange with a yellow price burst, as on its banner.
  'kolkata-comics-karnival-7-0': {
    logo: '/events/kolkata-comics-karnival-7-0/logo.png',
    edition: '7.0',
    tagline: ['Comics', 'Gaming', 'Collectibles', 'Cosplay'],
    colors: {
      ink: '#0A0A0A',      // banner black
      orange: '#FF7A1A',   // lower band
      burst: '#F2FF00',    // price starburst
      button: '#FFC21A',   // "Book tickets" button
      red: '#E10600'       // edition number
    }
  }
};

export const skinFor = eventId => EVENT_SKINS[eventId] || null;
