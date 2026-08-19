export type KpiDescription = {
  definition: string;
  typicalFormula?: string;
  caution?: string;
};

export const KPI_DESCRIPTIONS: Record<string, KpiDescription> = {
  'Current Ratio': {
    definition:
      'The ratio of current assets to current liabilities. This generally shows how well short-term operations are funding the overall costs of doing business. A generally acceptable current ratio is 2 to 1. But whether or not a specific ratio is satisfactory depends on the nature of the business and the characteristics of its current assets and liabilities. The minimum acceptable current ratio is obviously 1:1, but that relationship is usually playing it too close for comfort.',
    typicalFormula:
      'Current assets listed on a company\'s balance sheet including cash, accounts receivable, inventory, and other current assets that are expected to be liquidated or turned into cash in less than one year divided by current liabilities including accounts payable, wages, taxes payable, short-term debts, and the current portion of long-term debt.',
    caution:
      'A current ratio that is lower than the industry average may indicate a higher risk of distress or default. Similarly, if a company has a very high current ratio compared with its peer group, it indicates that management may not be using its assets efficiently.',
  },
  'Quick Ratio': {
    definition:
      'The quick ratio is one way to measure a business\'s ability to quickly convert short-term assets into cash. Also known as the "acid test ratio," the quick ratio is an indicator of a company\'s liquidity and financial health. A Quick Ratio that is equal to or greater than 1 means the company has enough liquid assets to meet its short-term obligations.',
    typicalFormula:
      'Cash, receivables / all short term liabilities such as accounts payable, payroll payable, credit card debt, short term bank loans and other debts that you would generally pay off in less than one year.',
    caution:
      'When this ratio decreases, it means you are incurring more debt to finance operations. If a business\'s quick ratio is less than 1, it means it doesn\'t have enough quick assets to meet all its short-term obligations. If it suffers an interruption, it may find it difficult to raise the cash to pay its creditors. In addition, the business could have to pay high interest rates if it needs to borrow money.',
  },
  'Inventory Turnover': {
    definition:
      'Inventory turnover is a financial ratio showing how many times a company turned over its inventory relative to its cost of goods sold (COGS) in a given period. Generally, the higher the ratio, the better.',
    typicalFormula: 'Cost of Goods Sold for the period divided by the average inventory for the period.',
    caution:
      'A relatively low inventory turnover ratio may be a sign of weak sales or excess inventory, while a higher ratio signals strong sales but may also indicate inadequate inventory stocking.',
  },
  'Receivables Turnover': {
    definition:
      'The accounts receivables turnover ratio (also called Sales/Receivables) measures the number of times a company collects its average accounts receivable balance. It is a quantification of a company\'s effectiveness in collecting outstanding balances from clients and managing its line of credit process.',
    typicalFormula: 'Net Sales for the period divided by average accounts receivable for the period.',
    caution:
      'A low receivables turnover ratio isn\'t a good thing. That may be due to an inadequate collection process, bad credit policies, or customers that are not financially viable or creditworthy. A low turnover ratio typically implies that the company should reassess its credit policies to ensure the timely collection of its receivables.',
  },
  'Payables Turnover': {
    definition:
      'The accounts payable turnover ratio shows how many times per period a company pays its accounts payable. In other words, the ratio measures the speed at which a company pays its suppliers.',
    typicalFormula: 'Cost of Goods Sold during the period divided by average accounts payable for the period.',
    caution:
      'A decreasing turnover ratio indicates that a company is taking longer to pay off its suppliers than in previous periods. The rate at which a company pays its debts could provide an indication of the company\'s financial condition. A decreasing ratio could signal that a company is in financial distress. Alternatively, a decreasing ratio could also mean the company has negotiated different payment arrangements with its suppliers.',
  },
  "Days' Inventory": {
    definition:
      'Days Sales in Inventory (DSI) is a measurement of the average number of days or time required for a business to convert its inventory into sales.',
    typicalFormula:
      'The DSI value is calculated by dividing the inventory balance (including work-in-progress) by the amount of cost of goods sold. The number is then multiplied by the number of days in a year, quarter, or month.',
    caution:
      'A high DSI value generally indicates either a slow sales performance or an excess of purchased inventory (the company is buying too much inventory), which may eventually become obsolete. However, it may also mean that a company with a high DSI is keeping high inventory levels to meet high expected customer demand.',
  },
  "Days' Receivables": {
    definition:
      'Sometimes referred to as DOR or "days of receivables," this ratio tells you how many average days of revenue are tied up in receivables. If all of your clients took exactly 30 days to pay their bills, you would have 30 days of revenue held in receivables. If you require your clients to pay in 2 weeks from the receipt of an invoice, the AR Days ratio will move closer to 15. And if you set up clients to pay a fixed monthly fee at the first of the month you actually start to move closer to zero days in AR.',
    typicalFormula: 'AR balance for the month / (Total sales for the month / 30).',
    caution:
      'When AR Days increases, more of your cash is getting tied up in AR and not available to pay bills and make payroll. A more subtle problem occurs when AR Days grows: the risk of lost revenue increases. In general, customers become less likely to pay the bills they owe the longer they delay in making payments. This is usually because there is an unresolved dispute or because the client\'s business is in trouble.',
  },
  "Days' Payables": {
    definition:
      'Days payable outstanding (DPO) is a financial ratio that indicates the average time (in days) that a company takes to pay its bills and invoices to its trade creditors, which may include suppliers, vendors, or financiers.',
    typicalFormula:
      'Average accounts payable for the period divided by Cost of Goods Sold for the period, multiplied by the number of days in the period.',
    caution:
      'A company with a higher value of DPO takes longer to pay its bills, which means that it can retain available funds for a longer duration, allowing the company an opportunity to use those funds in a better way to maximize the benefits. A high DPO, however, may also be a red flag indicating an inability to pay its bills on time.',
  },
  'Sales/Working Capital': {
    definition:
      'Net Sales to working capital ratio is a metric used to determine how efficiently the company is utilizing its current assets and liabilities to support a certain level of sales.',
    typicalFormula:
      'Net Sales for the company divided by Working Capital, where Working Capital is defined as Accounts Receivable plus Inventory less Accounts Payable.',
    caution:
      'A high ratio indicates that the working capital is used more times per year, which means a more frequent flow of capital. Low ratios imply that the company\'s working capital is not adequate for generating sales. This results in excessive use of accounts receivable and inventories to generate sales, a factor that might cause bad quality debts and obsolete inventory. The most attractive ratios are ones that remain constant over time, regardless of sales.',
  },
  'Interest Coverage': {
    definition:
      'The interest coverage ratio measures a company\'s ability to handle its outstanding debt. It is one of a number of debt ratios that can be used to evaluate a company\'s financial condition. A good interest coverage ratio is considered important by both market analysts and investors, since a company cannot grow—and may not even be able to survive—unless it can pay the interest on its existing obligations to creditors.',
    typicalFormula: 'EBIT for the period divided by the company\'s interest expense for the period.',
    caution:
      'A company barely able to meet its interest obligations with current earnings is in a very precarious financial position, as even a slight, temporary dip in revenue may render it financially insolvent.',
  },
  'Debt Service Coverage': {
    definition:
      'A debt service coverage ratio above 1 shows that the company is generating a profit and is sufficient enough to pay out its obligations and debts completely from the cash flow. The higher the ratio, the more debts a company can take on and is more capable of paying, making it more attractive to lenders. A higher DSC ratio is better than a lower one, with a typical minimum requirement of 1.25x.',
    typicalFormula: 'EBITDA or NOI for the period divided by Interest and Principal paid in the period.',
    caution:
      'Lenders routinely assess a borrower\'s DSCR. A DSCR of 1 indicates a company has exactly enough operating income to pay off its debt service costs. A DSCR of less than 1 denotes a negative cash flow, and the borrower may be unable to cover or pay current debt obligations without drawing on outside sources or borrowing more. A DSCR of 0.95 means there is only sufficient net operating income to cover 95% of annual debt payments.',
  },
  'Cash Flow to Debt': {
    definition:
      'This ratio calculates the ability of the company to cover its principal and interest payments for the period out of operating cash flow for the period. The higher the ratio, the better the company is able to cover its debt servicing cost from cash generated by the company.',
    typicalFormula:
      'Net cash after operations divided by the sum of current debt obligations (principal and interest payments for the period), where Operating Cash Flow = Operating Income + Depreciation - Taxes + Change in Working Capital, and Working Capital = Current Assets - Current Liabilities for the period.',
  },
  'Debt/Net Worth': {
    definition:
      'The debt/equity ratio shows the proportion of a company\'s assets which are financed through debt. If the ratio is less than 0.5, most of the company\'s assets are financed through equity. If the ratio is greater than 0.5, most of the company\'s assets are financed through debt. Companies with high debt/asset ratios are said to be "highly leveraged," and not highly liquid.',
    typicalFormula: 'The sum of accounts payable and long-term debt divided by Total Equity.',
    caution:
      'D/E ratio measures how much debt a company has taken on relative to the value of its assets net of liabilities. Debt must be repaid or refinanced, imposes interest expense that typically can\'t be deferred, and could impair or destroy the value of equity in the event of a default. As a result, a high D/E ratio is often associated with high investment risk; it means that a company relies primarily on debt financing.',
  },
  'Fixed Assets/Net Worth': {
    definition:
      'Fixed assets to net worth, also known as the non-current assets to net worth ratio, is a financial ratio used to measure the solvency of a company. The ratio shows how much of the owner\'s cash (net worth) is tied up in the form of fixed assets such as property, plant and equipment. A low ratio is indicative of greater solvency because the lower the ratio becomes the more funds are available to meet current obligations.',
    typicalFormula: 'Fixed Assets less accumulated depreciation divided by net worth.',
    caution:
      'The higher the ratio becomes, the lower your solvency since more funds are tied up with fixed assets. A ratio of 0.75 or higher is usually undesirable because it indicates that the firm is vulnerable to solvency problems. High ratios can be interpreted as liquidity problems because it means the company does not have immediate access to cash.',
  },
  'Leverage Ratio': {
    definition:
      'This ratio shows the degree to which a company has used debt to finance its assets. The calculation considers all of the company\'s debt, not just loans and bonds payable, and all assets, including intangibles.',
    typicalFormula: 'Total debt, the sum of a company\'s accounts payable and long-term debt, divided by total assets.',
    caution:
      'One shortcoming of the total debt-to-total assets ratio is that it does not provide any indication of asset quality since it lumps all tangible and intangible assets together.',
  },
  'Total Asset Turnover': {
    definition:
      'Also referred to as the asset turnover ratio, this measures the value of a company\'s sales or revenues relative to the value of its assets. The asset turnover ratio can be used as an indicator of the efficiency with which a company is using its assets to generate revenue.',
    typicalFormula: 'Total Sales for a period divided by Average Total Assets for the period.',
    caution:
      'Asset turnover ratios vary across different industry sectors, so only the ratios of companies that are in the same sector should be compared. For example, retail or service sector companies have relatively small asset bases combined with high sales volume. This leads to a high average asset turnover ratio. Meanwhile, firms in sectors like utilities or manufacturing tend to have large asset bases, which translates to lower asset turnover.',
  },
  'Return on Equity (ROE)': {
    definition:
      'Return on equity (ROE) is a measure of financial performance. Because shareholders\' equity is equal to a company\'s assets minus its debt, ROE is considered the return on net assets. ROE is considered a gauge of a corporation\'s profitability and how efficient it is in generating profits. The higher the ROE, the more efficient a company\'s management is at generating income and growth from its equity financing.',
    typicalFormula: 'To calculate ROE, divide net income by the value of shareholders\' equity.',
    caution:
      'Whether an ROE is deemed good or bad will depend on what is normal among a company\'s peers. It is reasonable to wonder why an average or slightly above-average ROE is preferable rather than an ROE that is double, triple, or even higher than the average of its peer group. Sometimes an extremely high ROE is a good thing if net income is extremely large compared to equity because a company\'s performance is so strong. However, an extremely high ROE is often due to a small equity account compared to net income, which indicates risk.',
  },
  'Return on Assets (ROA)': {
    definition:
      'The term return on assets (ROA) refers to a financial ratio that indicates how profitable a company is in relation to its total assets. Corporate management, analysts, and investors can use ROA to determine how efficiently a company uses its assets to generate a profit. Comparing profits to revenue is a useful operational metric, but comparing them to the resources a company used to earn them displays the feasibility of that company\'s existence. Return on assets is the simplest of such bang-for-the-buck measures. It tells you what earnings are generated from invested capital or assets.',
    typicalFormula: 'Net Income divided by average Total Assets for the period.',
    caution:
      'A higher ROA means a company is more efficient and productive at managing its balance sheet to generate profits, while a lower ROA indicates there is room for improvement.',
  },
  'EBITDA Margin': {
    definition:
      'EBITDA margin denotes the company\'s operating profitability. So, if your company has a high EBITDA margin, it means its business has a healthy earnings profile and is profitable. Profitable means that it has more earnings than expenses.',
    typicalFormula: 'Earnings before interest, taxes, depreciation and amortization (EBITDA) divided by total revenue.',
    caution:
      'The EBITDA calculation does not take into account the capital structure of the business as well as capex intensity. There might exist a case wherein the margins look optically high for a particular business and it is considered a healthy business proposition, however there is a substantial depreciation charge in the P&L account (below EBITDA level) which makes the overall profitability quite muted. In such a scenario, it\'s always beneficial to look at the overall return ratios of the company (RoCE) in conjunction with EBITDA and EBITDA margins.',
  },
  'EBIT Margin': {
    definition:
      'EBIT Margin is a profitability ratio used to measure how far the business is able to manage its operations effectively and efficiently. It is calculated by dividing the earnings before interest and taxes of the company by its net revenue.',
    typicalFormula:
      'EBIT Margin = (Total sales - COGS - Operating expenses) / Total sales × 100%. Alternatively, add back taxes and interest expense to net income (non-operating income and expense adjusted) and divide the result by total/net sales: (Net income + Interest expense + Taxes) / Total sales × 100%.',
    caution:
      'Lower EBIT margins indicate lower profitability. When comparing against its competitors, investors can determine if lower EBIT margins are due to the competitive landscape (where all companies are having lower margins) or an issue just within the company (where the company is facing lower sales and higher costs).',
  },
};
