# Test Results Analysis

## Summary
- **Total Scenarios**: 7
- **Passed**: 4 scenarios (57%)
- **Failed**: 3 scenarios (43%)
- **Skipped Steps**: 20 steps (due to earlier failures in scenarios)

## ✅ Passing Scenarios

### 1. Create a topic and publish a message
**Status**: ✅ PASSED (4/4 steps)
- All steps executed successfully
- Topic creation, message publishing, and message retrieval working correctly

### 2. Create a topic and publish a message with a threshold key
**Status**: ✅ PASSED (6/6 steps)
- Threshold key creation working
- Multi-signature topic submission working correctly

### 3. Create a mintable token
**Status**: ✅ PASSED (6/6 steps)
- Token creation with supply key working
- Token minting functionality verified

### 4. Create a fixed supply token
**Status**: ✅ PASSED (6/6 steps)
- Fixed supply token creation working
- Minting correctly fails for fixed supply tokens

---

## ❌ Failing Scenarios

### 1. Transfer tokens between 2 accounts
**Status**: ❌ FAILED
**Failed Step**: `And The first account holds 100 HTT tokens`
**Error**: `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`

**Root Cause**:
- When trying to set up the first account to have 100 HTT tokens, the code attempts to transfer tokens from the treasury account
- The first account (treasury) already has 1000 tokens (full initial supply)
- The code tries to transfer excess tokens (900) away, but the target account (second account) is not yet associated with the token
- The association check/process is failing or not completing before the transfer

**Technical Details**:
- The treasury account (first account) is automatically associated when the token is created
- However, when transferring excess tokens away, the target account needs to be associated first
- The association is being attempted, but the transfer is still failing with `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`

**Steps Completed**: 3/9 steps
**Steps Skipped**: 6 steps (skipped due to failure in step 4)

---

### 2. Create a token transfer transaction paid for by the recipient
**Status**: ❌ FAILED
**Failed Step**: `And The second account holds 100 HTT tokens`
**Error**: `TOKEN_NOT_ASSOCIATED_TO_ACCOUNT`

**Root Cause**:
- Similar to scenario 1, when trying to set up token balances, the account receiving tokens is not properly associated
- The second account needs to be associated with the token before it can receive tokens
- The association transaction is either failing or not being executed before the transfer

**Steps Completed**: 3/10 steps
**Steps Skipped**: 7 steps (skipped due to failure in step 4)

---

### 3. Create a multi party token transfer transaction
**Status**: ❌ FAILED
**Failed Step**: `And A first hedera account with more than 10 hbar and 100 HTT tokens`
**Error**: `Cannot adjust token balance: first account has 1000 tokens but needs 100. No other account available to transfer excess to.`

**Root Cause**:
- The token is created with 1000 tokens, all going to the treasury (first account)
- The test requires the first account to have exactly 100 tokens
- The code needs to transfer 900 tokens away, but at this point in the scenario:
  - No second account has been set up yet (it's set up in the next step)
  - No other account is available to receive the excess tokens
  - The code throws an error because it cannot find a target account

**Technical Details**:
- The scenario flow is:
  1. Create token (treasury gets 1000 tokens)
  2. Set up first account with 100 tokens ← **FAILS HERE**
  3. Set up second account with 100 tokens
  4. Set up third account with 100 tokens
  5. Set up fourth account with 100 tokens

- The issue is that step 2 needs to transfer 900 tokens away, but steps 3-5 haven't run yet, so there's no target account available

**Steps Completed**: 1/10 steps
**Steps Skipped**: 9 steps (skipped due to failure in step 2)

---

## 🔍 Detailed Error Analysis

### Error 1: TOKEN_NOT_ASSOCIATED_TO_ACCOUNT
**Occurrence**: Scenarios 1 and 2
**Location**: `setAccountTokenBalance` function when transferring tokens

**Why it happens**:
1. Token is created with treasury account (automatically associated)
2. Code tries to adjust balance by transferring tokens
3. Target account (receiving tokens) needs to be associated first
4. Association is attempted but either:
   - Not completing successfully
   - Not being awaited properly
   - Failing silently
   - The account association check is incorrectly determining the account is already associated when it's not

**Potential Solutions**:
- Ensure association completes before any transfer
- Add retry logic for association
- Verify association status after association transaction
- Add better error logging to see why association might be failing

### Error 2: No target account for excess tokens
**Occurrence**: Scenario 3
**Location**: First account setup step

**Why it happens**:
- Token creation happens before account setup steps
- Treasury account gets all initial supply (1000 tokens)
- First account setup step runs before other accounts are set up
- No account exists yet to receive the excess 900 tokens

**Potential Solutions**:
- Create a temporary holding account for excess tokens
- Reorder the steps to set up accounts before creating the token
- Allow the first account to keep excess tokens temporarily and adjust later
- Use the token creation account as a temporary holder

---

## 📊 Step-by-Step Breakdown

### Scenario 1: Transfer tokens between 2 accounts
1. ✅ Given A first hedera account with more than 10 hbar
2. ✅ And A second Hedera account
3. ✅ And A token named Test Token (HTT) with 1000 tokens
4. ❌ And The first account holds 100 HTT tokens ← **FAILS**
5. ⏭️ And The second account holds 0 HTT tokens (skipped)
6. ⏭️ When The first account creates a transaction to transfer 10 HTT tokens to the second account (skipped)
7. ⏭️ And The first account submits the transaction (skipped)
8. ⏭️ Then The second account holds 10 HTT tokens (skipped)
9. ⏭️ And The first account holds 90 HTT tokens (skipped)

### Scenario 2: Create a token transfer transaction paid for by the recipient
1. ✅ Given A first hedera account with more than 10 hbar
2. ✅ And A second Hedera account
3. ✅ And A token named Test Token (HTT) with 1000 tokens
4. ❌ And The second account holds 100 HTT tokens ← **FAILS**
5. ⏭️ And The first account holds 0 HTT tokens (skipped)
6. ⏭️ When The second account creates a transaction to transfer 10 HTT tokens to the first account (skipped)
7. ⏭️ And The first account submits the transaction (skipped)
8. ⏭️ Then The second account holds 90 HTT tokens (skipped)
9. ⏭️ And The first account holds 10 HTT tokens (skipped)
10. ⏭️ And The first account has paid for the transaction fee (skipped)

### Scenario 3: Create a multi party token transfer transaction
1. ✅ Given A token named Test Token (HTT) with 1000 tokens
2. ❌ And A first hedera account with more than 10 hbar and 100 HTT tokens ← **FAILS**
3. ⏭️ And A second Hedera account with 0 hbar and 100 HTT tokens (skipped)
4. ⏭️ And A third Hedera account with 0 hbar and 100 HTT tokens (skipped)
5. ⏭️ And A fourth Hedera account with 0 hbar and 100 HTT tokens (skipped)
6. ⏭️ When A transaction is created to transfer 10 HTT tokens out of the first and second account... (skipped)
7. ⏭️ And The first account submits the transaction (skipped)
8. ⏭️ Then The first account holds 90 HTT tokens (skipped)
9. ⏭️ And The second account holds 90 HTT tokens (skipped)
10. ⏭️ And The third account holds 105 HTT tokens (skipped)
11. ⏭️ And The fourth account holds 115 HTT tokens (skipped)


