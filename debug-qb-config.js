require('dotenv').config();

console.log('\n=== QuickBooks Configuration Debug ===\n');
console.log('Client ID:', process.env.QUICKBOOKS_CLIENT_ID ? `${process.env.QUICKBOOKS_CLIENT_ID.substring(0, 10)}...` : 'NOT SET');
console.log('Client Secret:', process.env.QUICKBOOKS_CLIENT_SECRET ? `${process.env.QUICKBOOKS_CLIENT_SECRET.substring(0, 5)}...` : 'NOT SET');
console.log('Environment:', process.env.QUICKBOOKS_ENVIRONMENT || 'NOT SET');
console.log('\nRedirect URI being used:');
console.log('--->', process.env.QUICKBOOKS_REDIRECT_URI || 'NOT SET');
console.log('\n=== What you need to add in Intuit Developer Portal ===');
console.log('1. Go to: https://developer.intuit.com/app/developer/myapps');
console.log('2. Select your app');
console.log('3. Go to Keys & OAuth tab');
console.log('4. In "Redirect URIs" section, add EXACTLY this:');
console.log('\n   ' + (process.env.QUICKBOOKS_REDIRECT_URI || 'http://localhost:3000/api/quickbooks/callback'));
console.log('\n5. Make sure:');
console.log('   - No trailing slash');
console.log('   - Exactly http:// (not https://)');
console.log('   - Exactly localhost:3000');
console.log('   - No spaces before or after');
console.log('\n======================================\n');


