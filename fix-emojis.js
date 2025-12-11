// Script to fix corrupted UTF-8 emojis in page.tsx
const fs = require('fs');

const emojiFixes = {
  'âŒ': '❌',  // cross mark
  'âœ“': '✅',  // checkmark
  'âš': '⚠️',  // warning
  'â€¢': '•',  // bullet point
  'â†’': '→',  // arrow
  'â†‘': '↑',  // up arrow
  'â†“': '↓',  // down arrow
  'ðŸ’¾': '💾',  // floppy disk
  'â³': '³',   // superscript 3
};

let content = fs.readFileSync('app/page.tsx', 'utf8');

for (const [corrupted, fixed] of Object.entries(emojiFixes)) {
  content = content.replace(new RegExp(corrupted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), fixed);
}

fs.writeFileSync('app/page.tsx', content, 'utf8');
console.log('Fixed corrupted emojis in page.tsx');







