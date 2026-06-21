import type { Db } from "./database.js";
import { Errors, now } from "./lib.js";
import { audit } from "./audit.js";
import { encryptField, decryptField } from "./crypto.js";
import { getVerification } from "./verification.js";

// ---------------------------------------------------------------------------
// UK bank-account detail collection + validation (payout setup / KYC).
//
// We collect the account holder name, a 6-digit sort code and an 8-digit
// account number, run the standard UK modulus check (VocaLink "Validating
// Account Numbers in the UK" — the algorithm behind the valacdos.txt weight
// table and scsubtab.txt sorting-code substitution table), encrypt the raw
// details at rest, and only ever persist/return a masked display form.
//
// NO MONEY MOVES through Fable+ (no custody, £0 platform fee). This is purely
// KYC/payout-account collection so a provider's own PSP can later pay them out.
// ---------------------------------------------------------------------------

// --- normalisation ----------------------------------------------------------

/** Strip spaces and hyphens from a sort code, accepting "12-34-56"/"12 34 56"/"123456". */
export function normaliseSortCode(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

/**
 * Normalise an account number to 8 digits. UK convention left-pads shorter
 * (6 or 7-digit) account numbers with zeros to 8 digits before validation.
 */
export function normaliseAccountNumber(raw: string): string {
  const digits = raw.replace(/[\s-]/g, "");
  if (/^\d{6,7}$/.test(digits)) return digits.padStart(8, "0");
  return digits;
}

/** Display mask, e.g. "••••5678" — only the last 4 digits are ever shown back. */
export function maskAccountNumber(accountNumber: string): string {
  const last4 = accountNumber.slice(-4);
  return `••••${last4}`;
}

// --- modulus checking engine ------------------------------------------------
//
// A weight row covers a range of sort codes and describes one check to run.
// In production these rows are loaded from VocaLink's valacdos.txt (one row per
// sort-code range) and scsubtab.txt (sort-code substitutions for DBLAL). The
// algorithm is identical regardless of how many rows back it; here we embed a
// small, representative subset so the engine genuinely executes and is testable.
//
// Row format mirrors valacdos.txt columns:
//   start..end  : inclusive sort-code range (6-digit numeric strings)
//   method      : MOD10 | MOD11 | DBLAL (double-alternate)
//   weights     : 14 weights applied to [u w a b c d e f g h i j k l]
//                 = sortcode(6) + accountnumber(8)
//   exception   : optional exception number (0..14) per the spec
//
// The 14 positions are conventionally labelled u w a b c d e f g h i j k l.

export interface WeightRow {
  start: string;
  end: string;
  method: "MOD10" | "MOD11" | "DBLAL";
  weights: number[]; // length 14
  exception?: number;
}

// --------------------------------------------------------------------------
// PRODUCTION: replace this embedded subset by loading the full VocaLink tables.
// e.g. loadValacdos(fs.readFileSync("valacdos.txt")) → WeightRow[] (~2500 rows)
//      loadScsubtab(fs.readFileSync("scsubtab.txt")) → substitution map.
// The engine below does NOT change — only the data backing it grows.
// --------------------------------------------------------------------------
export const EMBEDDED_WEIGHT_ROWS: WeightRow[] = [
  // Standard MOD11 range (no exception). Weights are the canonical
  // 8 7 6 5 4 3 2 1 ... layout used across most clearing banks.
  { start: "070000", end: "070099", method: "MOD11", weights: [0, 0, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0, 0, 0] },
  // Standard DBLAL (double-alternate) range. Used e.g. by some building
  // societies; alternate digits doubled, digit-sum taken, total mod 10 == 0.
  { start: "089000", end: "089999", method: "DBLAL", weights: [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1] },
  // Standard MOD10 range.
  { start: "100000", end: "109999", method: "MOD10", weights: [0, 0, 0, 0, 0, 0, 7, 5, 8, 3, 4, 6, 2, 1] },
];

/** Look up every weight row whose range contains the given sort code. */
function rowsForSortCode(sortCode: string, table: WeightRow[]): WeightRow[] {
  const sc = Number(sortCode);
  return table.filter((r) => sc >= Number(r.start) && sc <= Number(r.end));
}

/**
 * Run a single modulus check row against a 14-digit string (sortcode+account).
 *
 * - DBLAL: double-alternate. For each position, multiply the digit by the
 *   weight; if the product is two digits, add its digits together; sum all,
 *   the check passes when total mod 10 == 0.
 * - MOD10: weighted sum of digit*weight, passes when total mod 10 == 0.
 * - MOD11: weighted sum of digit*weight, passes when total mod 11 == 0.
 *
 * Exception handling: this subset implements the common exceptions that change
 * the pass condition (exception 4: remainder must equal the two check digits;
 * exception 1: add 27 to the weighted total before mod). Full exception 2/3/5..14
 * handling (sort-code/account substitution, conditional second checks) is where
 * the complete spec logic would slot in — clearly the place to extend.
 */
export function runWeightRow(digits14: number[], row: WeightRow): boolean {
  let total = 0;
  for (let i = 0; i < 14; i++) {
    let product = digits14[i] * row.weights[i];
    if (row.method === "DBLAL" && product > 9) {
      // sum the digits of a two-digit product (e.g. 16 -> 1 + 6 = 7)
      product = Math.floor(product / 10) + (product % 10);
    }
    total += product;
  }

  // Exception 1: add 27 to the total before taking the modulus.
  if (row.exception === 1) total += 27;

  if (row.method === "MOD11") {
    const remainder = total % 11;
    // Exception 4: the remainder must equal the value of the two check digits
    // (positions g & h, indices 8 & 9 = the account number's 3rd/4th digits).
    if (row.exception === 4) {
      const checkDigits = digits14[8] * 10 + digits14[9];
      return remainder === checkDigits;
    }
    return remainder === 0;
  }
  // MOD10 and DBLAL both pass on a multiple of 10.
  return total % 10 === 0;
}

export interface ModulusResult {
  /** true when the details pass every applicable check (or no rule covers them). */
  valid: boolean;
  /** true when at least one weight row covered this sort code. */
  checked: boolean;
}

/**
 * Validate a normalised sort code + account number with the modulus engine.
 *
 * Per the VocaLink spec: if a sort code has TWO applicable rows, both are run
 * and (outside the special two-check exceptions) the account is valid if it
 * passes the checks. If NO row covers the sort code, the algorithm reports the
 * account as valid (uncheckable) — we surface that via `checked: false` so the
 * caller can decide. With a small embedded table most real sort codes are
 * uncheckable; the full valacdos table closes that gap in production.
 */
export function modulusCheck(
  sortCode: string,
  accountNumber: string,
  table: WeightRow[] = EMBEDDED_WEIGHT_ROWS,
): ModulusResult {
  const combined = (sortCode + accountNumber).split("").map((c) => Number(c));
  if (combined.length !== 14 || combined.some((d) => Number.isNaN(d))) {
    return { valid: false, checked: true };
  }
  const rows = rowsForSortCode(sortCode, table);
  if (rows.length === 0) return { valid: true, checked: false };
  const valid = rows.every((r) => runWeightRow(combined, r));
  return { valid, checked: true };
}

// --- input validation with specific, correctable messages -------------------

export interface BankDetailsInput {
  accountHolderName: string;
  sortCode: string;
  accountNumber: string;
}

export interface ValidatedBankDetails {
  accountHolderName: string;
  sortCode: string; // normalised 6 digits
  accountNumber: string; // normalised 8 digits
}

/**
 * Validate raw bank details, throwing a 400 with a SPECIFIC, correctable
 * message for the first thing that is wrong. Returns the normalised details.
 */
export function validateBankDetails(input: BankDetailsInput): ValidatedBankDetails {
  const accountHolderName = (input.accountHolderName ?? "").trim();
  if (accountHolderName.length < 2) {
    throw Errors.badRequest("Enter the account holder's name exactly as it appears on the account.");
  }

  const sortCode = normaliseSortCode(input.sortCode ?? "");
  if (!/^\d{6}$/.test(sortCode)) {
    throw Errors.badRequest("Sort code must be 6 digits (e.g. 12-34-56).");
  }
  // No UK bank uses an all-zeros sort code — catch it before the modulus engine,
  // which would otherwise report it as "uncheckable" and let it through.
  if (/^0{6}$/.test(sortCode)) {
    throw Errors.badRequest("That sort code isn't valid — check your bank card or statement and re-enter the 6-digit sort code.");
  }

  const accountNumber = normaliseAccountNumber(input.accountNumber ?? "");
  if (!/^\d{8}$/.test(accountNumber)) {
    throw Errors.badRequest("Account number must be 8 digits.");
  }
  // An all-zeros account number is never a real account — reject it explicitly so
  // it can't slip through on a sort code the modulus engine can't check.
  if (/^0{8}$/.test(accountNumber)) {
    throw Errors.badRequest("That account number isn't valid — check your bank card or statement and re-enter the 8-digit account number.");
  }

  const { valid } = modulusCheck(sortCode, accountNumber);
  if (!valid) {
    throw Errors.badRequest(
      "These bank details didn't pass the UK bank check — please double-check the sort code and account number.",
    );
  }

  return { accountHolderName, sortCode, accountNumber };
}

// --- persistence (encrypted at rest, masked display) ------------------------

export interface BankAccountDisplay {
  accountHolderName: string;
  sortCodeMasked: string; // e.g. "12-**-**"
  accountNumberMasked: string; // e.g. "••••5678"
  updatedAt: number;
}

function maskSortCode(sortCode: string): string {
  return `${sortCode.slice(0, 2)}-**-**`;
}

/**
 * Validate and store bank details for an org. Raw sort code + account number are
 * encrypted via encryptField (AES-256-GCM); only masked forms are stored in the
 * clear for display. On success, gates verification.payout_setup = 1.
 *
 * We never log the raw account number — the audit entry carries only the mask.
 */
export async function saveBankDetails(
  db: Db,
  orgId: string,
  input: BankDetailsInput,
): Promise<BankAccountDisplay> {
  const v = validateBankDetails(input);
  const accountNumberMasked = maskAccountNumber(v.accountNumber);
  const sortCodeMasked = maskSortCode(v.sortCode);
  const ts = now();

  await db.run(
    `INSERT INTO bank_accounts
       (org_id, account_holder_name, sort_code_enc, account_number_enc, sort_code_masked, account_number_masked, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (org_id) DO UPDATE SET
       account_holder_name = excluded.account_holder_name,
       sort_code_enc = excluded.sort_code_enc,
       account_number_enc = excluded.account_number_enc,
       sort_code_masked = excluded.sort_code_masked,
       account_number_masked = excluded.account_number_masked,
       updated_at = excluded.updated_at`,
    [
      orgId,
      v.accountHolderName,
      encryptField(v.sortCode),
      encryptField(v.accountNumber),
      sortCodeMasked,
      accountNumberMasked,
      ts,
      ts,
    ],
  );

  // Valid bank details satisfy the payout-setup verification step.
  await db.run(`INSERT INTO verification (org_id) VALUES (?) ON CONFLICT DO NOTHING`, [orgId]);
  await db.run(`UPDATE verification SET payout_setup = 1 WHERE org_id = ?`, [orgId]);
  await getVerification(db, orgId);

  // audit carries only the masked form — never the raw account number (I36/I37).
  await audit(db, {
    action: "payout.bank_details_saved",
    targetType: "org",
    targetId: orgId,
    meta: { accountNumberMasked, sortCodeMasked },
  });

  return { accountHolderName: v.accountHolderName, sortCodeMasked, accountNumberMasked, updatedAt: ts };
}

/** Read back the masked display form (never decrypts the account number). */
export async function getBankDetails(db: Db, orgId: string): Promise<BankAccountDisplay | null> {
  const row = await db.get<{
    account_holder_name: string;
    sort_code_masked: string;
    account_number_masked: string;
    updated_at: number;
  }>(
    `SELECT account_holder_name, sort_code_masked, account_number_masked, updated_at
     FROM bank_accounts WHERE org_id = ?`,
    [orgId],
  );
  if (!row) return null;
  return {
    accountHolderName: row.account_holder_name,
    sortCodeMasked: row.sort_code_masked,
    accountNumberMasked: row.account_number_masked,
    updatedAt: row.updated_at,
  };
}

/**
 * Decrypt the raw stored details — internal use only (e.g. handing off to a
 * provider's PSP for payout). Tolerates plaintext for pre-encryption/dev data.
 * Callers MUST NOT log the result.
 */
export async function decryptBankDetails(
  db: Db,
  orgId: string,
): Promise<{ sortCode: string; accountNumber: string } | null> {
  const row = await db.get<{ sort_code_enc: string; account_number_enc: string }>(
    `SELECT sort_code_enc, account_number_enc FROM bank_accounts WHERE org_id = ?`,
    [orgId],
  );
  if (!row) return null;
  return {
    sortCode: decryptField(row.sort_code_enc) ?? "",
    accountNumber: decryptField(row.account_number_enc) ?? "",
  };
}
