// Test if the API accepts 0 pricing
const testData = {
  monthlyPrice: 0,
  quarterlyPrice: 0,
  annualPrice: 0
};

console.log('Testing API data transformation:');
console.log('Input:', testData);

// Simulate API logic from route.ts
const transformed = {
  monthlyPrice: testData.monthlyPrice ? parseFloat(testData.monthlyPrice.toString()) : 0,
  quarterlyPrice: testData.quarterlyPrice ? parseFloat(testData.quarterlyPrice.toString()) : 0,
  annualPrice: testData.annualPrice ? parseFloat(testData.annualPrice.toString()) : 0,
};

console.log('API would transform to:', transformed);

// Test with falsy values
const falsyTest = {
  monthlyPrice: 0,
  quarterlyPrice: 0,
  annualPrice: 0
};

console.log('\nTesting falsy logic:');
console.log('monthlyPrice (0) is truthy?', !!falsyTest.monthlyPrice);
console.log('quarterlyPrice (0) is truthy?', !!falsyTest.quarterlyPrice);
console.log('annualPrice (0) is truthy?', !!falsyTest.annualPrice);

console.log('\nAPI logic result:', {
  monthlyPrice: falsyTest.monthlyPrice ? parseFloat(falsyTest.monthlyPrice.toString()) : 0,
  quarterlyPrice: falsyTest.quarterlyPrice ? parseFloat(falsyTest.quarterlyPrice.toString()) : 0,
  annualPrice: falsyTest.annualPrice ? parseFloat(falsyTest.annualPrice.toString()) : 0,
});


