const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');

const prisma = new PrismaClient();

function parseArgs(argv) {
  const args = {
    month: '2023-03',
    companyId: '',
    out: '',
    diagnose: false,
    calendarOnly: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = String(argv[i] || '').trim();
    if (!token) continue;
    if (token === '--month' && argv[i + 1]) {
      args.month = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === '--companyId' && argv[i + 1]) {
      args.companyId = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === '--out' && argv[i + 1]) {
      args.out = String(argv[i + 1]).trim();
      i += 1;
      continue;
    }
    if (token === '--diagnose') {
      args.diagnose = true;
      continue;
    }
    if (token === '--calendarOnly') {
      args.calendarOnly = true;
      continue;
    }
  }

  if (!/^\d{4}-\d{2}$/.test(args.month)) {
    throw new Error('Invalid --month value. Use YYYY-MM (example: 2023-03).');
  }

  return args;
}

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function formatDate(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().slice(0, 10);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.diagnose) {
    const programCounts = await prisma.$queryRawUnsafe(`
      SELECT UPPER(COALESCE("errorDetails"->>'miProgram', '')) AS program, COUNT(*)::int AS count
      FROM "ApiSyncLog"
      WHERE platform = 'INFOR_M3'
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 30
    `);
    const slMeta = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int AS sl_log_count,
        MIN("createdAt") AS min_created_at,
        MAX("createdAt") AS max_created_at
      FROM "ApiSyncLog"
      WHERE platform = 'INFOR_M3'
        AND UPPER(COALESCE("errorDetails"->>'miProgram', '')) = 'SLLEDGERS'
    `);
    const periodCounts = await prisma.$queryRawUnsafe(`
      WITH logs AS (
        SELECT l."errorDetails"->'response'->'Items' AS items
        FROM "ApiSyncLog" l
        WHERE l.platform = 'INFOR_M3'
          AND UPPER(COALESCE(l."errorDetails"->>'miProgram', '')) = 'SLLEDGERS'
          AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ),
      ledger_rows AS (
        SELECT x.value AS r
        FROM logs
        CROSS JOIN LATERAL jsonb_array_elements(items) x
      )
      SELECT
        NULLIF(r->>'ControlYear','') AS control_year,
        NULLIF(r->>'ControlPeriod','') AS control_period,
        COUNT(*)::int AS count
      FROM ledger_rows
      GROUP BY 1, 2
      ORDER BY count DESC
      LIMIT 30
    `);
    const sampleRows = await prisma.$queryRawUnsafe(`
      WITH logs AS (
        SELECT l."errorDetails"->'response'->'Items' AS items
        FROM "ApiSyncLog" l
        WHERE l.platform = 'INFOR_M3'
          AND UPPER(COALESCE(l."errorDetails"->>'miProgram', '')) = 'SLLEDGERS'
          AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
      ),
      ledger_rows AS (
        SELECT x.value AS r
        FROM logs
        CROSS JOIN LATERAL jsonb_array_elements(items) x
      )
      SELECT
        r->>'ControlYear' AS control_year,
        r->>'ControlPeriod' AS control_period,
        r->>'RecordDate' AS record_date,
        r->>'TransDate' AS trans_date,
        r->>'Acct' AS acct,
        r->>'Description' AS description,
        r->>'ChaDescription' AS cha_description,
        r->>'DerDomAmountDebit' AS der_debit,
        r->>'DerDomAmountCredit' AS der_credit,
        r->>'DomAmount' AS dom_amount,
        r->>'Amount' AS amount,
        r
      FROM ledger_rows
      WHERE NULLIF(r->>'ControlYear','') = '2023'
        AND NULLIF(r->>'ControlPeriod','') IN ('3','03')
      LIMIT 3
    `);
    console.log(JSON.stringify({ programCounts, slMeta, periodCounts, sampleRows }, null, 2));
    return;
  }

  const [yearText, monthText] = args.month.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const startDate = `${args.month}-01`;
  const monthPredicate = args.calendarOnly
    ? Prisma.sql`
      (
        COALESCE(trans_date, record_date) >= ${startDate}::date
        AND COALESCE(trans_date, record_date) < (${startDate}::date + interval '1 month')
      )
    `
    : Prisma.sql`
      (
        (
          raw_control_year = ${String(year)}
          AND (raw_control_period = ${String(month)} OR raw_control_period = ${String(month).padStart(2, '0')})
        )
        OR (control_year = ${year} AND control_period = ${month})
        OR (trans_date >= ${startDate}::date AND trans_date < (${startDate}::date + interval '1 month'))
        OR (record_date >= ${startDate}::date AND record_date < (${startDate}::date + interval '1 month'))
      )
    `;
  const outputPath = args.out
    ? path.resolve(args.out)
    : path.resolve('docs', `infor-csi-transactions-${args.month}.csv`);

  const companyFilterSql = args.companyId
    ? Prisma.sql` AND l."companyId" = ${args.companyId} `
    : Prisma.sql``;

  const rows = await prisma.$queryRaw`
    WITH logs AS (
      SELECT
        l."companyId" AS company_id,
        l."errorDetails"->'response'->'Items' AS items
      FROM "ApiSyncLog" l
      WHERE l.platform = 'INFOR_M3'
        AND l.status = 'success'
        AND UPPER(COALESCE(l."errorDetails"->>'miProgram', '')) = 'SLLEDGERS'
        AND jsonb_typeof(l."errorDetails"->'response'->'Items') = 'array'
        ${companyFilterSql}
    ),
    ledger_rows AS (
      SELECT
        company_id,
        x.value AS r
      FROM logs
      CROSS JOIN LATERAL jsonb_array_elements(items) x
    ),
    normalized AS (
      SELECT
        company_id,
        trim(COALESCE(r->>'ControlYear', '')) AS raw_control_year,
        trim(COALESCE(r->>'ControlPeriod', '')) AS raw_control_period,
        CASE
          WHEN regexp_replace(COALESCE(r->>'ControlYear', ''), '[^0-9]', '', 'g') ~ '^[0-9]{4}$'
            THEN regexp_replace(COALESCE(r->>'ControlYear', ''), '[^0-9]', '', 'g')::int
          ELSE NULL
        END AS control_year,
        CASE
          WHEN regexp_replace(COALESCE(r->>'ControlPeriod', ''), '[^0-9]', '', 'g') ~ '^[0-9]{1,2}$'
            THEN regexp_replace(COALESCE(r->>'ControlPeriod', ''), '[^0-9]', '', 'g')::int
          ELSE NULL
        END AS control_period,
        CASE
          WHEN regexp_replace(COALESCE(r->>'TransDate', ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,}$'
            THEN to_date(substr(regexp_replace(COALESCE(r->>'TransDate', ''), '[^0-9]', '', 'g'), 1, 8), 'YYYYMMDD')
          ELSE NULL
        END AS trans_date,
        CASE
          WHEN regexp_replace(COALESCE(r->>'RecordDate', ''), '[^0-9]', '', 'g') ~ '^[0-9]{8,}$'
            THEN to_date(substr(regexp_replace(COALESCE(r->>'RecordDate', ''), '[^0-9]', '', 'g'), 1, 8), 'YYYYMMDD')
          ELSE NULL
        END AS record_date,
        COALESCE(
          NULLIF(r->>'Acct', ''),
          NULLIF(r->>'acct', ''),
          NULLIF(r->>'Account', ''),
          NULLIF(r->>'AccountNo', ''),
          NULLIF(r->>'GLAccount', ''),
          NULLIF(r->>'accountId', ''),
          NULLIF(r->>'ACID', '')
        ) AS account_id,
        COALESCE(
          NULLIF(r->>'ChaDescription', ''),
          NULLIF(r->>'FRDerDescription', ''),
          NULLIF(r->>'Description', ''),
          NULLIF(r->>'description', ''),
          NULLIF(r->>'DerTransType', ''),
          NULLIF(r->>'TransType', ''),
          NULLIF(r->>'Type', ''),
          NULLIF(r->>'Ref', ''),
          NULLIF(r->>'reference', '')
        ) AS transaction_name,
        COALESCE(
          CASE WHEN NULLIF(r->>'DomAmount','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r->>'DomAmount')::numeric ELSE NULL END,
          (
            CASE WHEN NULLIF(r->>'DerDomAmountDebit','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r->>'DerDomAmountDebit')::numeric ELSE 0 END
            - CASE WHEN NULLIF(r->>'DerDomAmountCredit','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r->>'DerDomAmountCredit')::numeric ELSE 0 END
          ),
          (
            CASE WHEN NULLIF(r->>'Debit','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r->>'Debit')::numeric ELSE 0 END
            - CASE WHEN NULLIF(r->>'Credit','') ~ '^-?[0-9]+([.][0-9]+)?$' THEN (r->>'Credit')::numeric ELSE 0 END
          ),
          0
        ) AS amount
      FROM ledger_rows
    )
    SELECT
      company_id,
      to_char(
        COALESCE(
        trans_date,
        record_date,
        CASE
          WHEN regexp_replace(raw_control_year, '[^0-9]', '', 'g') ~ '^[0-9]{4}$'
            AND regexp_replace(raw_control_period, '[^0-9]', '', 'g') ~ '^[0-9]{1,2}$'
            THEN make_date(
              regexp_replace(raw_control_year, '[^0-9]', '', 'g')::int,
              regexp_replace(raw_control_period, '[^0-9]', '', 'g')::int,
              1
            )
          WHEN control_year IS NOT NULL AND control_period BETWEEN 1 AND 12
            THEN make_date(control_year, control_period, 1)
          ELSE NULL
        END
      )::date,
      'YYYY-MM-DD'
      ) AS transaction_date,
      account_id,
      transaction_name,
      amount::float8 AS amount
    FROM normalized
    WHERE ${monthPredicate}
    ORDER BY company_id ASC, transaction_date ASC, account_id ASC, transaction_name ASC
  `;

  const lines = ['company_id,transaction_date,account_id,transaction_name,amount'];
  for (const row of rows) {
    lines.push(
      [
        csvEscape(row.company_id),
        csvEscape(formatDate(row.transaction_date)),
        csvEscape(row.account_id),
        csvEscape(row.transaction_name),
        csvEscape(row.amount),
      ].join(',')
    );
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');

  console.log(`Wrote ${rows.length} rows to ${outputPath}`);
  const datePresent = rows.filter((row) => row.transaction_date != null).length;
  const nonZeroAmount = rows.filter((row) => Number(row.amount || 0) !== 0).length;
  console.log(`Rows with transaction_date: ${datePresent}`);
  console.log(`Rows with non-zero amount: ${nonZeroAmount}`);
  if (!args.companyId) {
    const companyCounts = new Map();
    for (const row of rows) {
      const key = String(row.company_id || '');
      companyCounts.set(key, (companyCounts.get(key) || 0) + 1);
    }
    const summary = Array.from(companyCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([companyId, count]) => `${companyId}: ${count}`)
      .join('\n');
    if (summary) {
      console.log('\nRows by company:');
      console.log(summary);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
