const { parse } = require('@babel/parser');
const fs = require('fs');

const code = fs.readFileSync('app/page.tsx', 'utf8');
const lines = code.split('\n');

try {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript']
  });
  console.log('✅ Code is syntactically valid');
} catch (error) {
  console.log('❌ Syntax Error:', error.message);
  console.log('Line:', error.loc?.line);
  console.log('Column:', error.loc?.column);

  // Show context around the error
  const start = Math.max(0, error.loc.line - 3);
  const end = Math.min(lines.length, error.loc.line + 3);

  console.log('\nContext:');
  for (let i = start; i < end; i++) {
    const marker = i + 1 === error.loc.line ? '>>>' : '   ';
    console.log(`${marker} ${i + 1}: ${lines[i]}`);
  }
}
