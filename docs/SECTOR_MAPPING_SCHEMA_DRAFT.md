# Sector Mapping Schema Draft

This document defines the proposed normalized sector schema for sector-specific Revenue and COGS mapping.

It is intended as an approval artifact before implementation.

## Purpose

- Make Revenue and COGS mapping options sector-specific by company profile sector.
- Use stable field keys so mapping, processing, and reporting stay consistent.
- Ensure Master Data and downstream reporting only surface sector fields that actually have mapped data.

## Naming Standard

- Revenue keys: `rev_<snake_case_label>`
- COGS keys: `cogs_<snake_case_label>`
- Key rules:
  - lowercase
  - snake_case
  - strip punctuation/symbols (`/`, `%`, `+`, `&`, parentheses, hyphens)
  - keep labels editable in UI; keep keys stable once approved

## Sector Count Reconciliation

- Business expectation: 19 NAICS sector groups.
- Lists provided in scope below: 18 sector groups.
- Action needed before build: confirm the missing 19th group or confirm official total is 18.

---

## Proposed Sector Schema (Draft)

### NAICS 11 - Agriculture, Forestry, Fishing & Hunting

**Revenue categories**
- `rev_primary_commodity_sales` - Primary Commodity Sales
- `rev_contract_farming_production_agreements` - Contract Farming / Production Agreements
- `rev_processing_value_added_products` - Processing & Value-Added Products
- `rev_government_subsidies` - Government Subsidies
- `rev_crop_insurance_proceeds` - Crop Insurance Proceeds
- `rev_equipment_rental_custom_services` - Equipment Rental / Custom Services
- `rev_byproduct_scrap_sales` - Byproduct / Scrap Sales
- `rev_shipping_revenue` - Shipping Revenue
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_direct_materials_inputs` - Direct Materials & Inputs
- `cogs_direct_labor` - Direct Labor
- `cogs_equipment_fuel` - Equipment & Fuel
- `cogs_processing_packaging` - Processing & Packaging
- `cogs_other_cogs` - Other COGS

### NAICS 21 - Mining, Quarrying, Oil & Gas Extraction

**Revenue categories**
- `rev_raw_resource_sales` - Raw Resource Sales
- `rev_long_term_offtake_contracts` - Long-Term Offtake Contracts
- `rev_processing_refinement_revenue` - Processing & Refinement Revenue
- `rev_transportation_handling_revenue` - Transportation & Handling Revenue
- `rev_royalty_income` - Royalty Income
- `rev_hedging_commodity_settlement_gains` - Hedging / Commodity Settlement Gains
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_extraction_materials_supplies` - Extraction Materials & Supplies
- `cogs_direct_labor` - Direct Labor
- `cogs_equipment_fuel` - Equipment & Fuel
- `cogs_processing_refining_costs` - Processing & Refining Costs
- `cogs_other_cogs` - Other COGS

### NAICS 22 - Utilities

**Revenue categories**
- `rev_energy_sales` - Energy Sales
- `rev_transmission_distribution_charges` - Transmission / Distribution Charges
- `rev_capacity_charges` - Capacity Charges
- `rev_renewable_energy_credits` - Renewable Energy Credits
- `rev_connection_hook_up_fees` - Connection / Hook-Up Fees
- `rev_government_incentives` - Government Incentives
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_energy_production_costs` - Energy Production Costs
- `cogs_direct_labor` - Direct Labor
- `cogs_transmission_grid_costs` - Transmission & Grid Costs
- `cogs_infrastructure_depreciation` - Infrastructure Depreciation
- `cogs_other_cogs` - Other COGS

### NAICS 23 - Construction

**Revenue categories**
- `rev_contract_revenue` - Contract Revenue
- `rev_time_materials_revenue` - Time & Materials Revenue
- `rev_progress_milestone_billing` - Progress / Milestone Billing
- `rev_change_orders` - Change Orders
- `rev_service_maintenance_contracts` - Service & Maintenance Contracts
- `rev_equipment_rental_revenue` - Equipment Rental Revenue
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_direct_materials` - Direct Materials
- `cogs_direct_labor_field` - Direct Labor (Field)
- `cogs_subcontractors` - Subcontractors
- `cogs_equipment_rental_job_equipment` - Equipment Rental & Job Equipment
- `cogs_job_specific_permits_fees` - Job-Specific Permits / Fees
- `cogs_other_cogs` - Other COGS

**Balance sheet categories**

Assets:
- `cash` - Cash
- `ar` - Accounts Receivable
- `retainageReceivables` - Retainage Receivables
- `contractAssets` - Contract Assets
- `inventory` - Inventory
- `otherCA` - Other Current Assets
- `tca` - Total Current Assets
- `fixedAssets` - Fixed Assets
- `constructionEquipment` - Construction Equipment
- `officeEquipment` - Office Equipment
- `shopEquipment` - Shop Equipment
- `investments` - Investments
- `rightOfUseLeases` - Right of Use - Leases
- `otherAssets` - Other Assets
- `totalAssets` - Total Assets

Liabilities:
- `ap` - Accounts Payable
- `loc` - Line of Credit / Short-term Debt
- `contractLiabilities` - Contract Liabilities
- `otherCL` - Other Current Liabilities
- `tcl` - Total Current Liabilities
- `ltd` - Long-term Debt
- `totalLiab` - Total Liabilities

### NAICS 31-33 - Manufacturing

**Revenue categories**
- `rev_finished_goods_sales` - Finished Goods Sales
- `rev_custom_project_revenue` - Custom / Project Revenue
- `rev_oem_contract_manufacturing` - OEM / Contract Manufacturing
- `rev_aftermarket_service_revenue` - Aftermarket & Service Revenue
- `rev_tooling_engineering_revenue` - Tooling / Engineering Revenue
- `rev_scrap_other_revenue` - Scrap & Other Revenue
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_raw_materials_components` - Raw Materials & Components
- `cogs_direct_production_labor` - Direct Production Labor
- `cogs_manufacturing_overhead` - Manufacturing Overhead
- `cogs_production_equipment_depreciation` - Production Equipment Depreciation
- `cogs_scrap_yield_loss` - Scrap / Yield Loss
- `cogs_other_cogs` - Other COGS

### NAICS 42 - Wholesale Trade

**Revenue categories**
- `rev_product_resale_revenue` - Product Resale Revenue
- `rev_contract_program_revenue` - Contract / Program Revenue
- `rev_drop_ship_revenue` - Drop Ship Revenue
- `rev_freight_surcharge_revenue` - Freight & Surcharge Revenue
- `rev_vendor_rebates_incentives` - Vendor Rebates & Incentives
- `rev_value_added_services` - Value-Added Services
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_product_cost` - Product Cost
- `cogs_inbound_logistics` - Inbound Logistics
- `cogs_inventory_adjustments` - Inventory Adjustments
- `cogs_tariffs` - Tariffs
- `cogs_handling_and_preparation` - Handling & Preparation
- `cogs_outbound_fulfillment` - Outbound Fulfillment (policy-driven; some companies report freight-out and pick/pack/ship in selling expense instead of COGS)
- `cogs_contra_cogs` - Contra COGS (discounts, returns, rebates; stored as ingested - no sign flip on rollup)
- `cogs_other_cogs` - Other COGS

### NAICS 45 - Retail Trade

**Revenue categories**
- `rev_in_store_sales` - In-Store Sales
- `rev_e_commerce_sales` - E-Commerce Sales
- `rev_subscription_membership_revenue` - Subscription / Membership Revenue
- `rev_private_label_sales` - Private Label Sales
- `rev_warranty_protection_plans` - Warranty & Protection Plans
- `rev_vendor_rebates_co_op` - Vendor Rebates / Co-Op
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_merchandise_purchases` - Merchandise Purchases
- `cogs_freight_in` - Freight-In
- `cogs_inventory_shrinkage_write_offs` - Inventory Shrinkage & Write-Offs
- `cogs_distribution_center_labor` - Distribution Center Labor
- `cogs_other_cogs` - Other COGS

### NAICS 48-49 - Transportation & Warehousing

**Revenue categories**
- `rev_freight_revenue` - Freight Revenue
- `rev_dedicated_contract_services` - Dedicated Contract Services
- `rev_fuel_surcharges` - Fuel Surcharges
- `rev_warehousing_storage_fees` - Warehousing & Storage Fees
- `rev_logistics_3pl_revenue` - Logistics / 3PL Revenue
- `rev_accessorial_charges` - Accessorial Charges
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_direct_driver_labor` - Direct Driver Labor
- `cogs_fuel` - Fuel
- `cogs_equipment_costs` - Equipment Costs
- `cogs_insurance_fleet` - Insurance - Fleet
- `cogs_toll_accessorial_service_costs` - Toll & Accessorial Service Costs
- `cogs_other_cogs` - Other COGS

### NAICS 51 - Information

**Revenue categories**
- `rev_subscription_revenue` - Subscription Revenue
- `rev_advertising_revenue` - Advertising Revenue
- `rev_licensing_revenue` - Licensing Revenue
- `rev_data_analytics_revenue` - Data & Analytics Revenue
- `rev_implementation_setup_fees` - Implementation / Setup Fees
- `rev_support_maintenance_revenue` - Support & Maintenance Revenue
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_hosting_infrastructure` - Hosting & Infrastructure
- `cogs_direct_service_labor` - Direct Service Labor
- `cogs_content_licensing_royalties` - Content Licensing / Royalties
- `cogs_payment_processing_costs` - Payment Processing Costs
- `cogs_other_cogs` - Other COGS

### NAICS 52 - Finance & Insurance

**Revenue categories**
- `rev_interest_income` - Interest Income
- `rev_fee_income` - Fee Income
- `rev_asset_management_fees` - Asset Management Fees
- `rev_commission_revenue` - Commission Revenue
- `rev_insurance_premium_revenue` - Insurance Premium Revenue
- `rev_performance_incentive_fees` - Performance / Incentive Fees
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_cost_of_funds` - Cost of Funds
- `cogs_claims_expense` - Claims Expense
- `cogs_commission_expense` - Commission Expense
- `cogs_servicing_processing_costs` - Servicing & Processing Costs
- `cogs_other_cogs` - Other COGS

### NAICS 53 - Real Estate & Rental & Leasing

**Revenue categories**
- `rev_rental_income` - Rental Income
- `rev_cam_operating_cost_recoveries` - CAM / Operating Cost Recoveries
- `rev_property_management_fees` - Property Management Fees
- `rev_lease_termination_fees` - Lease Termination Fees
- `rev_development_disposition_gains` - Development / Disposition Gains
- `rev_ancillary_income` - Ancillary Income
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_property_operating_costs` - Property Operating Costs
- `cogs_direct_property_labor` - Direct Property Labor
- `cogs_property_management_costs` - Property Management Costs
- `cogs_building_depreciation` - Building Depreciation
- `cogs_other_cogs` - Other COGS

### NAICS 54 - Professional, Scientific & Technical Services

**Revenue categories**
- `rev_billable_service_revenue` - Billable Service Revenue
- `rev_retainer_revenue` - Retainer Revenue
- `rev_project_based_revenue` - Project-Based Revenue
- `rev_licensing_ip_revenue` - Licensing / IP Revenue
- `rev_success_performance_fees` - Success / Performance Fees
- `rev_reimbursable_expenses` - Reimbursable Expenses
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_direct_billable_labor` - Direct Billable Labor
- `cogs_subcontractor_fees` - Subcontractor Fees
- `cogs_project_specific_travel_expenses` - Project-Specific Travel & Expenses
- `cogs_reimbursable_direct_costs` - Reimbursable Direct Costs
- `cogs_other_cogs` - Other COGS

### NAICS 56 - Admin & Support + Waste Management

**Revenue categories**
- `rev_service_contract_revenue` - Service Contract Revenue
- `rev_staffing_revenue` - Staffing Revenue
- `rev_waste_collection_revenue` - Waste Collection Revenue
- `rev_environmental_service_revenue` - Environmental Service Revenue
- `rev_facility_management_contracts` - Facility Management Contracts
- `rev_surcharges_environmental_fees` - Surcharges / Environmental Fees
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_direct_service_labor` - Direct Service Labor
- `cogs_disposal_landfill_fees` - Disposal / Landfill Fees
- `cogs_fleet_equipment_costs` - Fleet & Equipment Costs
- `cogs_supplies_consumables` - Supplies & Consumables
- `cogs_other_cogs` - Other COGS

### NAICS 61 - Educational Services

**Revenue categories**
- `rev_tuition_revenue` - Tuition Revenue
- `rev_certification_exam_fees` - Certification / Exam Fees
- `rev_subscription_online_course_revenue` - Subscription / Online Course Revenue
- `rev_corporate_training_contracts` - Corporate Training Contracts
- `rev_grants_government_funding` - Grants & Government Funding
- `rev_ancillary_revenue_materials_housing` - Ancillary Revenue (materials, housing)
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_instructional_labor` - Instructional Labor
- `cogs_curriculum_materials` - Curriculum & Materials
- `cogs_platform_delivery_costs` - Platform / Delivery Costs
- `cogs_other_cogs` - Other COGS

### NAICS 62 - Health Care & Social Assistance

**Revenue categories**
- `rev_patient_service_revenue` - Patient Service Revenue
- `rev_insurance_reimbursements` - Insurance Reimbursements
- `rev_capitation_revenue` - Capitation Revenue
- `rev_government_program_revenue` - Government Program Revenue
- `rev_lab_ancillary_services` - Lab / Ancillary Services
- `rev_grants_subsidies` - Grants / Subsidies
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_clinical_labor` - Clinical Labor
- `cogs_medical_supplies` - Medical Supplies
- `cogs_lab_imaging_costs` - Lab / Imaging Costs
- `cogs_pharmaceuticals` - Pharmaceuticals
- `cogs_other_cogs` - Other COGS

### NAICS 71 - Arts, Entertainment & Recreation

**Revenue categories**
- `rev_ticket_sales` - Ticket Sales
- `rev_membership_revenue` - Membership Revenue
- `rev_sponsorship_revenue` - Sponsorship Revenue
- `rev_merchandise_sales` - Merchandise Sales
- `rev_licensing_media_revenue` - Licensing / Media Revenue
- `rev_concessions_revenue` - Concessions Revenue
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_performer_talent_costs` - Performer / Talent Costs
- `cogs_production_costs` - Production Costs
- `cogs_venue_rental` - Venue Rental
- `cogs_event_specific_labor` - Event-Specific Labor
- `cogs_other_cogs` - Other COGS

### NAICS 72 - Accommodation & Food Services

**Revenue categories**
- `rev_room_revenue` - Room Revenue
- `rev_food_beverage_revenue` - Food & Beverage Revenue
- `rev_event_banquet_revenue` - Event / Banquet Revenue
- `rev_franchise_fees` - Franchise Fees
- `rev_delivery_catering_revenue` - Delivery / Catering Revenue
- `rev_ancillary_services` - Ancillary Services
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_food_beverage_cost` - Food & Beverage Cost
- `cogs_kitchen_labor` - Kitchen Labor
- `cogs_housekeeping_labor` - Housekeeping Labor
- `cogs_guest_supplies` - Guest Supplies
- `cogs_other_cogs` - Other COGS

### NAICS 81 - Other Services

**Revenue categories**
- `rev_service_revenue` - Service Revenue
- `rev_maintenance_contracts` - Maintenance Contracts
- `rev_membership_revenue` - Membership Revenue
- `rev_product_sales` - Product Sales
- `rev_commission_revenue` - Commission Revenue
- `rev_miscellaneous_fees` - Miscellaneous Fees
- `rev_other_revenue` - Other Revenue

**COGS categories**
- `cogs_direct_service_labor` - Direct Service Labor
- `cogs_parts_materials` - Parts & Materials
- `cogs_subcontractor_costs` - Subcontractor Costs
- `cogs_other_cogs` - Other COGS

---

## Implementation Notes (No Code Yet)

- Revenue/COGS mapping options should be filtered by `company.industrySectorCategory`.
- Mapping save APIs should validate category keys against this sector schema.
- Master Data should store sparse sector-category values and expose only populated fields.
- Data Review and downstream financial tabs should render only categories with data.
- Sector changes should trigger mapping revalidation and remap workflow.

