# Day 2 - Solana Payroll Program with Anchor

## Overview
This document summarizes all the questions and learning points covered in the chat about creating a Solana payroll program using Anchor and Rust.

---

## 1. Stream Struct (lib.rs)
- **Purpose:** Stores the state of each payroll stream on-chain.
- **Fields:**
  - `employer`: Solana address of employer.
  - `employee`: Solana address of employee.
  - `start_time`: Timestamp when streaming begins (`i64` to support negative timestamps pre-1970).
  - `rate_per_second`: Tokens released per second.
  - `deposited_amount`: Total funds locked.
  - `claimed_amount`: Amount already claimed by employee.
- **Anchor Note:** `#[account]` marks this as a struct stored on a PDA (Program Derived Address).

**Discussion:**
- `i64` for timestamp allows compatibility with Solana's clock and potential negative values.
- `Pubkey` represents addresses of employer and employee.
- `u64` is used for all amounts because token balances cannot be negative.

---

## 2. create_stream Instruction (lib.rs)
- **Purpose:** Initialize a payroll stream PDA with employer, employee, deposit, and streaming rate.
- **Process:**
  1. Access the PDA account via `ctx.accounts.stream`.
  2. Assign `employer` and `employee` keys.
  3. Set `start_time` using `Clock::get()?.unix_timestamp`.
  4. Set `rate_per_second`, `deposited_amount`, and initialize `claimed_amount` to 0.

**Syntax Details:**
- `Clock::get()?` fetches blockchain time; `?` propagates any error.
- `key()` method retrieves the public key of a Signer.

---

## 3. PDA (Program Derived Address) Setup (lib.rs)
- **Purpose:** Ensures each stream account is unique and deterministic.
- **Seeds:** `['stream', employer_pubkey, employee_pubkey]`.
- **Space Calculation:** 8 bytes for discriminator + sum of field sizes in the struct.
- **Anchor Attributes:**
  - `init`: Create the PDA.
  - `payer`: Account paying for rent (usually employer).
  - `bump`: Ensures the PDA is valid.
- **Employee Account:** Can be unchecked because they are not required to sign at creation.

---

## 4. Anchor Test (tests/payroll.ts)
- **Purpose:** Test the create_stream instruction locally.
- **Steps:**
  1. Generate employee keypair and use provider wallet as employer.
  2. Compute PDA address using `findProgramAddress`.
  3. Call `createStream` via Anchor RPC method.
  4. Fetch the PDA data and assert fields match expected values.

**Discussion:**
- Tests run on a local test validator (`solana-test-validator`).
- Anchor automatically funds the PDA from the employer wallet.
- Passing tests indicate correct initialization of on-chain stream state.

---

## 5. Solana Wallet and Anchor Setup
- **Error:** "Unable to read keypair file" occurs if Anchor cannot find the wallet.
- **Fix:**
  1. Generate a wallet keypair (`solana-keygen new --outfile <path>`).
  2. Set `ANCHOR_WALLET` env variable or configure `Anchor.toml`.
  3. Ensure the keypair file is valid JSON array of 64 bytes.
  4. Verify wallet by running `solana address -k <path>`.

**Tip:** Can use multiple wallets (dev1.json, dev2.json) to simulate employer and employee.

---

## 6. Running Anchor Tests
- Anchor detects the `test` script in Anchor.toml and executes TypeScript tests.
- Uses `ts-mocha` to run tests.
- Warnings about ES modules appear if `package.json` lacks `"type": "module"` — not critical.
- Successful test shows PDA creation, initialization, and field verification.

---

## 7. Git Commit Suggestions
- **Long commit message example:**
```
feat: add create_stream instruction for Solana payroll

- Implemented Stream account struct
- Added CreateStream instruction
- Set up PDA for unique employer+employee stream
- First local Anchor test passing
```
- **Short commit message for daily work:**
```
feat: implement create_stream instruction with PDA for payroll
```
- Multi-line commits require either editing in Vim or using proper CLI syntax.

---

## 8. What Actually Happened When Test Ran
1. Anchor prepared a transaction calling `create_stream`.
2. Local test validator processed the transaction.
3. PDA account was created with proper space and rent paid.
4. Stream struct was initialized on-chain.
5. Test fetched the PDA data and verified all fields.
6. Test passed, confirming the program works locally.

**Conceptually:** You created your first **on-chain payroll stream instance** on a local Solana blockchain.

---

This summary contains all the discussions, clarifications, and practical steps from Day 2 of building the Solana payroll program using Anchor.

