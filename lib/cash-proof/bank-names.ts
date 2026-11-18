/** Names of common U.S. business banks, as printed on statements. Longer names come before names they contain. */
const BANKS: Array<[RegExp, string]> = [
  [/\bjp\s?morgan chase\b|\bchase bank\b|\bchase\.com\b/i, 'Chase'],
  [/\bbank of america\b/i, 'Bank of America'],
  [/\bwells fargo\b/i, 'Wells Fargo'],
  [/\bciti(bank|business)?\b/i, 'Citibank'],
  [/\bu\.?\s?s\.? bank\b|\busbank\.com\b/i, 'U.S. Bank'],
  [/\bpnc\b/i, 'PNC Bank'],
  [/\btruist\b/i, 'Truist'],
  [/\bcapital one\b/i, 'Capital One'],
  [/\btd bank\b/i, 'TD Bank'],
  [/\bfifth third\b/i, 'Fifth Third Bank'],
  [/\bfirst citizens\b/i, 'First Citizens Bank'],
  [/\bcitizens bank\b/i, 'Citizens Bank'],
  [/\bregions bank\b|\bregions\.com\b/i, 'Regions Bank'],
  [/\bm\s?&\s?t bank\b/i, 'M&T Bank'],
  [/\bhuntington\b/i, 'Huntington Bank'],
  [/\bkeybank\b/i, 'KeyBank'],
  [/\bbmo\b/i, 'BMO'],
  [/\bsantander\b/i, 'Santander'],
  [/\bally bank\b/i, 'Ally Bank'],
  [/\bfirst horizon\b/i, 'First Horizon'],
  [/\bsynovus\b/i, 'Synovus'],
  [/\bfrost bank\b/i, 'Frost Bank'],
  [/\bcomerica\b/i, 'Comerica'],
  [/\bzions\b/i, 'Zions Bank'],
  [/\bwebster bank\b/i, 'Webster Bank'],
  [/\bvalley national\b|\bvalley bank\b/i, 'Valley Bank'],
  [/\bwestern alliance\b/i, 'Western Alliance Bank'],
  [/\beast west bank\b/i, 'East West Bank'],
  [/\bcadence bank\b/i, 'Cadence Bank'],
  [/\bassociated bank\b/i, 'Associated Bank'],
  [/\bold national\b/i, 'Old National Bank'],
  [/\bpinnacle\b/i, 'Pinnacle Bank'],
  [/\bbankunited\b/i, 'BankUnited'],
  [/\bumpqua\b/i, 'Umpqua Bank'],
  [/\bbank ozk\b/i, 'Bank OZK'],
  [/\bhancock whitney\b/i, 'Hancock Whitney'],
  [/\barvest\b/i, 'Arvest Bank'],
  [/\bnavy federal\b/i, 'Navy Federal Credit Union'],
  [/\bmercury\b/i, 'Mercury'],
  [/\brelay financial\b/i, 'Relay'],
  [/\bbluevine\b/i, 'Bluevine'],
  [/\blive oak bank\b/i, 'Live Oak Bank'],
  [/\bsilicon valley bank\b/i, 'Silicon Valley Bank'],
  [/\baxos\b/i, 'Axos Bank'],
  [/\bamerican express\b/i, 'American Express'],
  [/\bfirst platypus\b/i, 'First Platypus Bank'],
];

/** The first recognized bank named near the top of a statement; later mentions are usually payees. */
export function detectBankName(text: string): string | null {
  const head = text.slice(0, 4000);
  let best: { index: number; name: string } | null = null;
  for (const [pattern, name] of BANKS) {
    const index = head.search(pattern);
    if (index >= 0 && (!best || index < best.index)) best = { index, name };
  }
  return best?.name ?? null;
}
