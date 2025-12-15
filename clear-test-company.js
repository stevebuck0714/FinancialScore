// Script to clear "TEST EVERTHING AGAIN" company data from localStorage
// Run this in the browser console on your Financial Score app

// Check what data exists in localStorage
console.log('Current localStorage keys:', Object.keys(localStorage));

// Look for company data
const companiesData = localStorage.getItem('fs_companies');
if (companiesData) {
  try {
    const companies = JSON.parse(companiesData);
    console.log('Current companies in localStorage:', companies);

    // Find and remove "TEST EVERTHING AGAIN"
    const filteredCompanies = companies.filter(company =>
      !company.name || !company.name.toLowerCase().includes('test everthing again')
    );

    if (filteredCompanies.length !== companies.length) {
      console.log('Found and removing "TEST EVERTHING AGAIN" from companies');
      localStorage.setItem('fs_companies', JSON.stringify(filteredCompanies));
      console.log('✅ Company removed from localStorage');
    } else {
      console.log('❌ Company "TEST EVERTHING AGAIN" not found in localStorage companies');
    }
  } catch (e) {
    console.error('Error parsing companies data:', e);
  }
} else {
  console.log('No companies data found in localStorage');
}

// Check for other related data that might need cleaning
const keysToCheck = ['fs_selectedCompanyId', 'fs_financialDataRecords', 'fs_currentUser'];
keysToCheck.forEach(key => {
  const data = localStorage.getItem(key);
  if (data) {
    console.log(`Found data in ${key}:`, data.substring(0, 100) + '...');
  }
});

console.log('\nTo completely clear all localStorage data, run: localStorage.clear()');



