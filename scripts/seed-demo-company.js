"use strict";
/**
 * Seed Operational Data for Demonstration Company (Production)
 *
 * Usage:
 * 1. Set your production DATABASE_URL in .env or pass it directly
 * 2. Run: npx ts-node scripts/seed-demo-company.ts <companyId>
 *
 * Example:
 * DATABASE_URL="your-prod-db-url" npx ts-node scripts/seed-demo-company.ts cmj0apf5000qtqhbcrcvb0d8f
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
var client_1 = require("@prisma/client");
var prisma = new client_1.PrismaClient();
// Get company ID from command line argument
var companyId = process.argv[2];
if (!companyId) {
    console.error('❌ Error: Company ID is required');
    console.log('Usage: npx ts-node scripts/seed-demo-company.ts <companyId>');
    process.exit(1);
}
console.log('🌱 Seeding operational data for Demonstration Company...');
console.log('📊 Company ID:', companyId);
console.log('🗄️  Database:', ((_b = (_a = process.env.DATABASE_URL) === null || _a === void 0 ? void 0 : _a.split('@')[1]) === null || _b === void 0 ? void 0 : _b.split('/')[0]) || 'unknown');
// Confirm this is intentional
function confirmSeeding() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    console.log('\n⚠️  This will add operational data to the specified company.');
                    console.log('⚠️  Make sure this is the correct company ID!');
                    console.log('\nStarting in 3 seconds...\n');
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 3000); })];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function seedOperationalData() {
    return __awaiter(this, void 0, void 0, function () {
        var company, deleted, endDate, startDate, baseMonthlyRevenue, baseARTotal, baseAPTotal, baseInventoryValue, baseCashBalance, totalRecords, currentDate, monthStart, monthEnd, monthlyVariance, monthlyRevenue, arTotal, apTotal, invValue, cashBalance, week, weekDate, weeklyVariance, weeklyRevenue, weeklyArTotal, weeklyApTotal, weeklyInvValue, weeklyCashBalance, daysInMonth, day, dayDate, dailyVariance, dailyRevenue, dailyArTotal, dailyApTotal, dailyInvValue, dailyCashBalance, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 37, 38, 40]);
                    return [4 /*yield*/, confirmSeeding()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, prisma.company.findUnique({
                            where: { id: companyId },
                            select: { id: true, name: true }
                        })];
                case 2:
                    company = _a.sent();
                    if (!company) {
                        console.error('❌ Company not found with ID:', companyId);
                        process.exit(1);
                    }
                    console.log('✅ Company found:', company.name);
                    console.log('\n🧹 Clearing existing operational data...\n');
                    return [4 /*yield*/, Promise.all([
                            prisma.customerSalesSnapshot.deleteMany({ where: { companyId: companyId } }),
                            prisma.aRAgingSnapshot.deleteMany({ where: { companyId: companyId } }),
                            prisma.aPAgingSnapshot.deleteMany({ where: { companyId: companyId } }),
                            prisma.productSalesSnapshot.deleteMany({ where: { companyId: companyId } }),
                            prisma.inventorySnapshot.deleteMany({ where: { companyId: companyId } }),
                            prisma.cashSnapshot.deleteMany({ where: { companyId: companyId } })
                        ])];
                case 3:
                    deleted = _a.sent();
                    console.log('🗑️  Deleted existing records:');
                    console.log("   - Customer Sales: ".concat(deleted[0].count));
                    console.log("   - AR Aging: ".concat(deleted[1].count));
                    console.log("   - AP Aging: ".concat(deleted[2].count));
                    console.log("   - Product Sales: ".concat(deleted[3].count));
                    console.log("   - Inventory: ".concat(deleted[4].count));
                    console.log("   - Cash: ".concat(deleted[5].count));
                    console.log('');
                    endDate = new Date();
                    endDate.setHours(0, 0, 0, 0);
                    startDate = new Date(endDate);
                    startDate.setMonth(startDate.getMonth() - 12);
                    console.log('📅 Generating data from', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
                    console.log('');
                    baseMonthlyRevenue = 450000;
                    baseARTotal = 180000;
                    baseAPTotal = 120000;
                    baseInventoryValue = 250000;
                    baseCashBalance = 150000;
                    totalRecords = 0;
                    currentDate = new Date(startDate);
                    _a.label = 4;
                case 4:
                    if (!(currentDate <= endDate)) return [3 /*break*/, 36];
                    monthStart = new Date(currentDate);
                    monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
                    console.log("\uD83D\uDCC6 Processing ".concat(monthStart.toLocaleDateString('en-US', { year: 'numeric', month: 'long' }), "..."));
                    monthlyVariance = 0.7 + Math.random() * 0.6;
                    monthlyRevenue = Math.round(baseMonthlyRevenue * monthlyVariance);
                    return [4 /*yield*/, prisma.customerSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                customerId: 'demo-customer-1',
                                customerName: 'Acme Corporation',
                                revenue: monthlyRevenue * 0.4,
                                invoiceCount: 8 + Math.floor(Math.random() * 5),
                                avgInvoiceSize: 0,
                            }
                        })];
                case 5:
                    _a.sent();
                    return [4 /*yield*/, prisma.customerSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                customerId: 'demo-customer-2',
                                customerName: 'Global Industries',
                                revenue: monthlyRevenue * 0.35,
                                invoiceCount: 6 + Math.floor(Math.random() * 4),
                                avgInvoiceSize: 0,
                            }
                        })];
                case 6:
                    _a.sent();
                    return [4 /*yield*/, prisma.customerSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                customerId: 'demo-customer-3',
                                customerName: 'Tech Solutions Inc',
                                revenue: monthlyRevenue * 0.25,
                                invoiceCount: 5 + Math.floor(Math.random() * 3),
                                avgInvoiceSize: 0,
                            }
                        })];
                case 7:
                    _a.sent();
                    totalRecords += 3;
                    arTotal = Math.round(baseARTotal * monthlyVariance);
                    return [4 /*yield*/, prisma.aRAgingSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                totalAR: arTotal,
                                current: arTotal * 0.70,
                                days1to30: arTotal * 0.15,
                                days31to60: arTotal * 0.10,
                                days61to90: arTotal * 0.03,
                                days90plus: arTotal * 0.02
                            }
                        })];
                case 8:
                    _a.sent();
                    totalRecords += 1;
                    apTotal = Math.round(baseAPTotal * monthlyVariance);
                    return [4 /*yield*/, prisma.aPAgingSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                totalAP: apTotal,
                                current: apTotal * 0.75,
                                days1to30: apTotal * 0.15,
                                days31to60: apTotal * 0.07,
                                days61to90: apTotal * 0.02,
                                days90plus: apTotal * 0.01
                            }
                        })];
                case 9:
                    _a.sent();
                    totalRecords += 1;
                    // 4. Monthly Product Sales
                    return [4 /*yield*/, prisma.productSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                itemId: 'prod-001',
                                itemName: 'Premium Widget',
                                sku: 'WIDGET-001',
                                quantitySold: 120 + Math.floor(Math.random() * 40),
                                revenue: monthlyRevenue * 0.45,
                                cogs: monthlyRevenue * 0.45 * 0.35
                            }
                        })];
                case 10:
                    // 4. Monthly Product Sales
                    _a.sent();
                    return [4 /*yield*/, prisma.productSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                itemId: 'prod-002',
                                itemName: 'Standard Widget',
                                sku: 'WIDGET-002',
                                quantitySold: 200 + Math.floor(Math.random() * 60),
                                revenue: monthlyRevenue * 0.35,
                                cogs: monthlyRevenue * 0.35 * 0.40
                            }
                        })];
                case 11:
                    _a.sent();
                    return [4 /*yield*/, prisma.productSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                itemId: 'prod-003',
                                itemName: 'Basic Widget',
                                sku: 'WIDGET-003',
                                quantitySold: 300 + Math.floor(Math.random() * 80),
                                revenue: monthlyRevenue * 0.20,
                                cogs: monthlyRevenue * 0.20 * 0.45
                            }
                        })];
                case 12:
                    _a.sent();
                    totalRecords += 3;
                    invValue = Math.round(baseInventoryValue * monthlyVariance);
                    return [4 /*yield*/, prisma.inventorySnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                itemId: 'inv-001',
                                itemName: 'Premium Widget',
                                sku: 'WIDGET-001',
                                qtyOnHand: 450 + Math.floor(Math.random() * 100),
                                assetValue: invValue * 0.40,
                                avgCost: 220
                            }
                        })];
                case 13:
                    _a.sent();
                    return [4 /*yield*/, prisma.inventorySnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                itemId: 'inv-002',
                                itemName: 'Standard Widget',
                                sku: 'WIDGET-002',
                                qtyOnHand: 800 + Math.floor(Math.random() * 150),
                                assetValue: invValue * 0.35,
                                avgCost: 110
                            }
                        })];
                case 14:
                    _a.sent();
                    return [4 /*yield*/, prisma.inventorySnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                itemId: 'inv-003',
                                itemName: 'Basic Widget',
                                sku: 'WIDGET-003',
                                qtyOnHand: 1200 + Math.floor(Math.random() * 200),
                                assetValue: invValue * 0.25,
                                avgCost: 52
                            }
                        })];
                case 15:
                    _a.sent();
                    totalRecords += 3;
                    cashBalance = Math.round(baseCashBalance * monthlyVariance);
                    return [4 /*yield*/, prisma.cashSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                accountId: 'cash-001',
                                accountName: 'Operating Account',
                                accountNumber: '****1234',
                                cashBalance: cashBalance * 0.70,
                                changeAmount: null,
                                changePercent: null
                            }
                        })];
                case 16:
                    _a.sent();
                    return [4 /*yield*/, prisma.cashSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: monthStart,
                                frequency: 'monthly',
                                accountId: 'cash-002',
                                accountName: 'Savings Account',
                                accountNumber: '****5678',
                                cashBalance: cashBalance * 0.30,
                                changeAmount: null,
                                changePercent: null
                            }
                        })];
                case 17:
                    _a.sent();
                    totalRecords += 2;
                    week = 0;
                    _a.label = 18;
                case 18:
                    if (!(week < 4)) return [3 /*break*/, 26];
                    weekDate = new Date(monthStart);
                    weekDate.setDate(weekDate.getDate() + (week * 7));
                    if (weekDate > endDate)
                        return [3 /*break*/, 26];
                    weeklyVariance = 0.85 + Math.random() * 0.3;
                    weeklyRevenue = Math.round((monthlyRevenue / 4) * weeklyVariance);
                    // Weekly snapshots (simplified - just one record per category)
                    return [4 /*yield*/, prisma.customerSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: weekDate,
                                frequency: 'weekly',
                                customerId: 'demo-customer-all',
                                customerName: 'All Customers',
                                revenue: weeklyRevenue,
                                invoiceCount: 15 + Math.floor(Math.random() * 8),
                                avgInvoiceSize: 0,
                            }
                        })];
                case 19:
                    // Weekly snapshots (simplified - just one record per category)
                    _a.sent();
                    return [4 /*yield*/, prisma.productSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: weekDate,
                                frequency: 'weekly',
                                itemId: 'prod-all',
                                itemName: 'All Products',
                                sku: 'ALL',
                                quantitySold: 150 + Math.floor(Math.random() * 50),
                                revenue: weeklyRevenue,
                                cogs: weeklyRevenue * 0.38
                            }
                        })];
                case 20:
                    _a.sent();
                    weeklyArTotal = Math.round((baseARTotal / 4) * weeklyVariance);
                    return [4 /*yield*/, prisma.aRAgingSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: weekDate,
                                frequency: 'weekly',
                                totalAR: weeklyArTotal,
                                current: weeklyArTotal * 0.70,
                                days1to30: weeklyArTotal * 0.15,
                                days31to60: weeklyArTotal * 0.10,
                                days61to90: weeklyArTotal * 0.03,
                                days90plus: weeklyArTotal * 0.02
                            }
                        })];
                case 21:
                    _a.sent();
                    weeklyApTotal = Math.round((baseAPTotal / 4) * weeklyVariance);
                    return [4 /*yield*/, prisma.aPAgingSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: weekDate,
                                frequency: 'weekly',
                                totalAP: weeklyApTotal,
                                current: weeklyApTotal * 0.75,
                                days1to30: weeklyApTotal * 0.15,
                                days31to60: weeklyApTotal * 0.07,
                                days61to90: weeklyApTotal * 0.02,
                                days90plus: weeklyApTotal * 0.01
                            }
                        })];
                case 22:
                    _a.sent();
                    weeklyInvValue = Math.round((baseInventoryValue / 4) * weeklyVariance);
                    return [4 /*yield*/, prisma.inventorySnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: weekDate,
                                frequency: 'weekly',
                                itemId: 'inv-all',
                                itemName: 'All Inventory',
                                sku: 'ALL',
                                qtyOnHand: 2000 + Math.floor(Math.random() * 300),
                                assetValue: weeklyInvValue,
                                avgCost: 125
                            }
                        })];
                case 23:
                    _a.sent();
                    weeklyCashBalance = Math.round((baseCashBalance / 4) * weeklyVariance);
                    return [4 /*yield*/, prisma.cashSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: weekDate,
                                frequency: 'weekly',
                                accountId: 'cash-all',
                                accountName: 'All Accounts',
                                accountNumber: '****ALL',
                                cashBalance: weeklyCashBalance,
                                changeAmount: null,
                                changePercent: null
                            }
                        })];
                case 24:
                    _a.sent();
                    totalRecords += 7;
                    _a.label = 25;
                case 25:
                    week++;
                    return [3 /*break*/, 18];
                case 26:
                    if (!(monthStart >= new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000))) return [3 /*break*/, 35];
                    daysInMonth = monthEnd.getDate();
                    day = 1;
                    _a.label = 27;
                case 27:
                    if (!(day <= daysInMonth)) return [3 /*break*/, 35];
                    dayDate = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
                    if (dayDate > endDate)
                        return [3 /*break*/, 35];
                    if (dayDate < new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000))
                        return [3 /*break*/, 34];
                    dailyVariance = 0.90 + Math.random() * 0.2;
                    dailyRevenue = Math.round((monthlyRevenue / 30) * dailyVariance);
                    // Daily snapshots
                    return [4 /*yield*/, prisma.customerSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: dayDate,
                                frequency: 'daily',
                                customerId: 'demo-customer-all',
                                customerName: 'All Customers',
                                revenue: dailyRevenue,
                                invoiceCount: 2 + Math.floor(Math.random() * 3),
                                avgInvoiceSize: 0,
                            }
                        })];
                case 28:
                    // Daily snapshots
                    _a.sent();
                    return [4 /*yield*/, prisma.productSalesSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: dayDate,
                                frequency: 'daily',
                                itemId: 'prod-all',
                                itemName: 'All Products',
                                sku: 'ALL',
                                quantitySold: 20 + Math.floor(Math.random() * 10),
                                revenue: dailyRevenue,
                                cogs: dailyRevenue * 0.38
                            }
                        })];
                case 29:
                    _a.sent();
                    dailyArTotal = Math.round((baseARTotal / 30) * dailyVariance);
                    return [4 /*yield*/, prisma.aRAgingSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: dayDate,
                                frequency: 'daily',
                                totalAR: dailyArTotal,
                                current: dailyArTotal * 0.70,
                                days1to30: dailyArTotal * 0.15,
                                days31to60: dailyArTotal * 0.10,
                                days61to90: dailyArTotal * 0.03,
                                days90plus: dailyArTotal * 0.02
                            }
                        })];
                case 30:
                    _a.sent();
                    dailyApTotal = Math.round((baseAPTotal / 30) * dailyVariance);
                    return [4 /*yield*/, prisma.aPAgingSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: dayDate,
                                frequency: 'daily',
                                totalAP: dailyApTotal,
                                current: dailyApTotal * 0.75,
                                days1to30: dailyApTotal * 0.15,
                                days31to60: dailyApTotal * 0.07,
                                days61to90: dailyApTotal * 0.02,
                                days90plus: dailyApTotal * 0.01
                            }
                        })];
                case 31:
                    _a.sent();
                    dailyInvValue = Math.round((baseInventoryValue / 30) * dailyVariance);
                    return [4 /*yield*/, prisma.inventorySnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: dayDate,
                                frequency: 'daily',
                                itemId: 'inv-all',
                                itemName: 'All Inventory',
                                sku: 'ALL',
                                qtyOnHand: 2000 + Math.floor(Math.random() * 100),
                                assetValue: dailyInvValue,
                                avgCost: 125
                            }
                        })];
                case 32:
                    _a.sent();
                    dailyCashBalance = Math.round((baseCashBalance / 30) * dailyVariance);
                    return [4 /*yield*/, prisma.cashSnapshot.create({
                            data: {
                                companyId: companyId,
                                snapshotDate: dayDate,
                                frequency: 'daily',
                                accountId: 'cash-all',
                                accountName: 'All Accounts',
                                accountNumber: '****ALL',
                                cashBalance: dailyCashBalance,
                                changeAmount: null,
                                changePercent: null
                            }
                        })];
                case 33:
                    _a.sent();
                    totalRecords += 7;
                    _a.label = 34;
                case 34:
                    day++;
                    return [3 /*break*/, 27];
                case 35:
                    // Move to next month
                    currentDate.setMonth(currentDate.getMonth() + 1);
                    return [3 /*break*/, 4];
                case 36:
                    console.log('');
                    console.log('✅ Seeding completed successfully!');
                    console.log('📊 Total records created:', totalRecords);
                    console.log('');
                    console.log('Summary:');
                    console.log('  - 12 months of monthly data');
                    console.log('  - ~48 weeks of weekly data');
                    console.log('  - ~90 days of daily data');
                    console.log('  - 6 operational categories: Customer Sales, AR, AP, Products, Inventory, Cash');
                    return [3 /*break*/, 40];
                case 37:
                    error_1 = _a.sent();
                    console.error('❌ Error seeding data:', error_1);
                    throw error_1;
                case 38: return [4 /*yield*/, prisma.$disconnect()];
                case 39:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 40: return [2 /*return*/];
            }
        });
    });
}
// Run the seeding
seedOperationalData()
    .then(function () {
    console.log('');
    console.log('🎉 Done! You can now view the operational data in the Operations section.');
    process.exit(0);
})
    .catch(function (error) {
    console.error('Fatal error:', error);
    process.exit(1);
});
