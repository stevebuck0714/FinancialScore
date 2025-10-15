export interface Question {
  id: string;
  text: string;
}

export interface Category {
  id: number;
  name: string;
  questions: Question[];
}

export const assessmentData: Category[] = [
  {
    id: 1,
    name: "Management Processes",
    questions: [
      { id: "1-1", text: "How developed is your monthly process for reviewing key priorities for your business?" },
      { id: "1-2", text: "How aware are key staff of the top 5 priorities for your company every month?" },
      { id: "1-3", text: "Rate how well you communicate with key management staff on a daily, weekly basis about highest priorities" },
      { id: "1-4", text: "How developed is your ability to see key performance indicators for your business and give feedback to key staff on performance against those metrics?" },
      { id: "1-5", text: "How aware are key staff of how major business decisions get made and who makes them?" }
    ]
  },
  {
    id: 2,
    name: "Financial Performance",
    questions: [
      { id: "2-1", text: "To what level do you understand the complete cost structure of your business? (Staff, Operating Expenses, Overheads)" },
      { id: "2-2", text: "How developed is your ability to translate marketing activities into sales revenues?" },
      { id: "2-3", text: "How developed is your ability to measure financial performance of your business, each line of business (LOB) and staff?" },
      { id: "2-4", text: "To what level are you aware of the COGS that impact Gross Margin?" },
      { id: "2-5", text: "To what level do you track specific financial goals and review progress on at least a monthly basis?" },
      { id: "2-6", text: "How developed is your ability to connect operational activities to financial performance?" }
    ]
  },
  {
    id: 3,
    name: "Sales Activities",
    questions: [
      { id: "3-1", text: "How aware of your sales pipeline are you (stages, number and value?)" },
      { id: "3-2", text: "To what extent are you aware of your sales conversion rates?" },
      { id: "3-3", text: "To what extent do you have a process for evaluating the value of client prospects?" },
      { id: "3-4", text: "To what extent do you have a process for evaluating sales activities and providing feedback to key staff on priorities for improvement?" },
      { id: "3-5", text: "How aware are you of your sales broken out by vertical market?" }
    ]
  },
  {
    id: 4,
    name: "Marketing Activities",
    questions: [
      { id: "4-1", text: "To what extent do you have a cohesive brand that is portrayed in all marketing collateral?" },
      { id: "4-2", text: "How aware are you of your key marketing messages?" },
      { id: "4-3", text: "To what extent do you have metrics on your marketing reach (number of contacts, email open rates, email click through rates, frequency of emails, etc.)" },
      { id: "4-4", text: "How aware are you of the effectiveness of your marketing campaign(s) (conversions, new customers, etc.)?" },
      { id: "4-5", text: "To what extent do you have a process for evaluating marketing activities and providing feedback to key staff on priorities for improvement?" }
    ]
  },
  {
    id: 5,
    name: "Operational Activities",
    questions: [
      { id: "5-1", text: "To what extent do you assign owner(s) to key areas of responsibility and high priorities?" },
      { id: "5-2", text: "How well do you understand staff utilization by type of contract you have with clients?" },
      { id: "5-3", text: "To what extent do your service staff understand how to identify sales opportunities at clients?" },
      { id: "5-4", text: "How aware are key staff of their key performance drivers that relate to financial performance improvement?" },
      { id: "5-5", text: "To what extent do you have a process for evaluation of activity and effectiveness of your staff?" }
    ]
  },
  {
    id: 6,
    name: "Client Portfolio Management",
    questions: [
      { id: "6-1", text: "Rate your current ability to do client portfolio based analysis?" },
      { id: "6-2", text: "How would you rate your ability to understand the market verticals you serve and the nuances of each vertical to better serve those verticals?" },
      { id: "6-3", text: "To what extent do you understand the potential growth of revenues given client movement up your portfolio quartiles" },
      { id: "6-4", text: "To what extent do you fully understand the risk areas within your client portfolio?" },
      { id: "6-5", text: "To what extent do you and your sales people/person review sales opportunities across your client portfolio?" }
    ]
  },
  {
    id: 7,
    name: "Contracts",
    questions: [
      { id: "7-1", text: "To what extent do you require clients to sign a written agreements for your services?" },
      { id: "7-2", text: "How aware are you of the contract status with each of your clients?" },
      { id: "7-3", text: "To what extent do you offer monthly 'managed services' agreements to your clients?" },
      { id: "7-4", text: "How aware are you of the strategic business needs of your clients (putting aside their technology needs)?" },
      { id: "7-5", text: "To what extent do you make multiple service package options available to prospective clients?" }
    ]
  },
  {
    id: 8,
    name: "Technology Usage",
    questions: [
      { id: "8-1", text: "To what extent do you leverage technology to monitor the technology performance of your clients?" },
      { id: "8-2", text: "Rate your ability to track all activities your service staff completes for your clients" },
      { id: "8-3", text: "Rate your ability to track all operational activities and understand progress on key priorities." },
      { id: "8-4", text: "How well would you say you leverage technology to maintain critical information for the support of your clients?" }
    ]
  },
  {
    id: 9,
    name: "Benchmarking",
    questions: [
      { id: "9-1", text: "To what extent do you benchmark performance internally?" },
      { id: "9-2", text: "To what extent do you benchmark performance against other companies like yours?" },
      { id: "9-3", text: "How would you rate your ability to understand how to use benchmarks to improve performance?" },
      { id: "9-4", text: "How aware are key staff of the performance financial benchmarks for your company?" }
    ]
  },
  {
    id: 10,
    name: "Forecasting/Planning",
    questions: [
      { id: "10-1", text: "To what extent do you have an annual planning process to set major objectives for the year?" },
      { id: "10-2", text: "To what extent do you review quarterly report cards with your key management staff?" },
      { id: "10-3", text: "To what extent do your planning activities result in the creation of objectives, milestones and financial goals?" },
      { id: "10-4", text: "How aware are you of where your financial performance is heading - looking ahead 12 months?" }
    ]
  },
  {
    id: 11,
    name: "Service",
    questions: [
      { id: "11-1", text: "How aware are key staff of client feedback on the quality of services you provide?" },
      { id: "11-2", text: "How aware is your staff of all key processes to provide services to clients?" },
      { id: "11-3", text: "To what extent are you able to serve clients with your existing staff?" },
      { id: "11-4", text: "How aware are your clients (and their employees) of how to engage you for assistance with setting IT strategies for their business?" },
      { id: "11-5", text: "How aware are your clients (and their employees) of how to engage you for technical support?" }
    ]
  },
  {
    id: 12,
    name: "Staff Contributions",
    questions: [
      { id: "12-1", text: "How aware are you of how many Full Time Equivalents (FTEs) that are contributing to your revenue and expenses?" },
      { id: "12-2", text: "To what extent do you understand how your employees, contractors, staff and owners contribute to overall revenues?" },
      { id: "12-3", text: "To what extent do you understand how your employees, contractors, staff and owners contribute to overall expenses?" },
      { id: "12-4", text: "To what extend do you understand how your employees, contractors, staff and owners contribute to overall profits?" },
      { id: "12-5", text: "How aware are you of the monthly cost of salaries and benefits?" }
    ]
  },
  {
    id: 13,
    name: "Business Value",
    questions: [
      { id: "13-1", text: "To what extent to you understand how your business would be valued if you wanted to sell it?" },
      { id: "13-2", text: "How would you rate your understanding of the key elements of business value?" },
      { id: "13-3", text: "To what extent do you understand key ratios a bank would look at to value your business for the purposes of receiving finances?" },
      { id: "13-4", text: "How would you rate your understanding of how an investor in your business would discount your business value?" }
    ]
  }
];

export const ratingScale = [
  { value: 0, label: "N/A", description: "Not applicable" },
  { value: 1, label: "1", description: "No evidence to support practices or any knowledge of subject" },
  { value: 2, label: "2", description: "Limited practices in place, limited knowledge of subject" },
  { value: 3, label: "3", description: "Basic practices in place, basic awareness of subject" },
  { value: 4, label: "4", description: "Clear practices in place, above average knowledge of subject" },
  { value: 5, label: "5", description: "Extensive practices in place, extensive knowledge of subject" }
];

