# SonarQube Scan Fix - Bugfix Design

## Overview

The SonarQube scan integration silently produces zero findings because of four compounding defects in `code-analysis/code-analysis.ts`: (1) the scanner binary discovery misses the Homebrew installation path, (2) the scanner is invoked without required arguments, (3) the frontend/backend parameter name for the Opengrep toggle is mismatched, and (4) `/opt/homebrew/bin` is absent from candidate paths. The fix targets each defect with minimal, surgical changes to restore correct scanner discovery, invocation, and parameter handling while preserving all existing behavior for non-affected code paths.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — sonar-scanner is installed at `/opt/homebrew/bin/sonar-scanner` but not found, OR the scanner is found but invoked without arguments, OR the frontend sends `enableOpengrep` but the backend expects `enableSemgrep`
- **Property (P)**: The desired behavior — scanner is discovered at Homebrew path, invoked with correct arguments, and the Opengrep toggle is correctly interpreted
- **Preservation**: Existing behaviors that must remain unchanged — PATH-based scanner lookup, graceful skip when unconfigured, Semgrep scanning, custom rules scanning
- **findSonarScanner()**: Function in `code-analysis/code-analysis.ts` (~line 820) that checks candidate paths for the sonar-scanner binary
- **runSonarScanner()**: Function in `code-analysis/code-analysis.ts` (~line 870) that writes `sonar-project.properties` and executes the scanner binary
- **runScan**: API endpoint in `code-analysis/code-analysis.ts` (~line 413) that accepts scan parameters and orchestrates the scan

## Bug Details

### Bug Condition

The bug manifests when a SonarQube scan is triggered on a macOS system where `sonar-scanner` is installed via Homebrew at `/opt/homebrew/bin/sonar-scanner`. The `findSonarScanner()` function does not include this path in its candidate list, and even if the binary were found, `runSonarScanner()` invokes it with no arguments — just the quoted binary path — so the scanner exits without analyzing any files. Additionally, the frontend sends `enableOpengrep` but the backend parameter is `enableSemgrep`, causing the toggle to have no effect.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ScanInvocation
  OUTPUT: boolean
  
  RETURN (input.sonarScannerInstalledAt = "/opt/homebrew/bin/sonar-scanner"
          AND "/opt/homebrew/bin/sonar-scanner" NOT IN findSonarScanner.candidates)
         OR (input.scannerBinResolved = true
             AND input.execSyncCommand = JSON.stringify(scannerBin)
             AND input.execSyncCommand DOES NOT CONTAIN "-Dsonar.")
         OR (input.requestBody.enableOpengrep IS DEFINED
             AND input.backendParam.enableSemgrep IS UNDEFINED)
END FUNCTION
```

### Examples

- **Example 1**: `sonar-scanner` installed at `/opt/homebrew/bin/sonar-scanner`, Encore runtime PATH is `/usr/bin:/usr/local/bin`. `findSonarScanner()` returns `null` → scan skipped silently. **Expected**: returns `"/opt/homebrew/bin/sonar-scanner"`.
- **Example 2**: `findSonarScanner()` returns `"/usr/local/bin/sonar-scanner"`. `runSonarScanner()` executes `execSync('"/usr/local/bin/sonar-scanner"')` with no arguments. Scanner starts but has no project configuration via CLI → exits with 0 findings. **Expected**: executes with `-Dsonar.projectBaseDir=<repoDir>` or equivalent arguments.
- **Example 3**: Frontend sends `{ enableOpengrep: true, enableSonarqube: true }`. Backend destructures `params.enableSemgrep` which is `undefined`, defaults to `true`. The toggle has no effect. **Expected**: Backend accepts `enableOpengrep` or maps it from the frontend parameter name.
- **Example 4 (edge case)**: `sonar-scanner` is in system PATH at `/usr/local/bin/sonar-scanner`. `findSonarScanner()` finds it via the `"sonar-scanner"` candidate. This path works today and must continue to work after the fix.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- PATH-based lookup of `"sonar-scanner"` (bare command) must continue to work when the binary is in the system PATH
- `~/.sonar/native-sonar-scanner/sonar-scanner` candidate must continue to be checked
- `/usr/local/bin/sonar-scanner` and `/opt/sonar-scanner/bin/sonar-scanner` candidates must continue to be checked
- When SonarQube URL or token is not configured, scanning is skipped gracefully with a log message
- When no scanner binary is found at any candidate path, `null` is returned and scanning is skipped
- Semgrep scanning continues to work independently of SonarQube changes
- Custom rules scanning continues to work independently of SonarQube changes
- The `sonar-project.properties` file is still written to `repoDir` before scanner invocation
- Mouse/UI interactions for triggering scans remain unchanged

**Scope:**
All inputs that do NOT involve SonarQube scanner discovery, SonarQube scanner invocation, or the Opengrep/Semgrep parameter toggle should be completely unaffected by this fix. This includes:
- Semgrep scan execution and result parsing
- Custom rules scanning
- Git clone operations
- Finding persistence and progress updates
- All other API endpoints

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **Missing Homebrew Candidate Path**: `findSonarScanner()` has a hardcoded candidate list that includes `"sonar-scanner"` (PATH lookup), `~/.sonar/native-sonar-scanner/sonar-scanner`, `/usr/local/bin/sonar-scanner`, and `/opt/sonar-scanner/bin/sonar-scanner` — but NOT `/opt/homebrew/bin/sonar-scanner`. On macOS with Apple Silicon, Homebrew installs to `/opt/homebrew/bin/` which may not be in Encore's runtime PATH.

2. **Missing Scanner Arguments**: In `runSonarScanner()`, the `execSync` call is:
   ```typescript
   execSync(`${JSON.stringify(scannerBin)}`, { cwd: repoDir, ... })
   ```
   This passes only the quoted binary path with zero arguments. While `sonar-project.properties` is written to `repoDir` and `cwd` is set to `repoDir`, the scanner may need explicit `-Dsonar.projectBaseDir` or the properties file may not be picked up correctly without it. The scanner needs at minimum to be invoked in a way that it reads the properties file from the working directory.

3. **Parameter Name Mismatch**: The `runScan` endpoint declares `enableSemgrep?: boolean` but the frontend sends `enableOpengrep`. Since the property name was likely renamed on the frontend during an Opengrep rebrand but the backend was not updated, the value is always `undefined` and defaults to `true`.

4. **Potential `cwd` Effectiveness**: Even though `cwd: repoDir` is set, the scanner binary may not automatically look for `sonar-project.properties` in the current working directory without being told to. Adding `-Dsonar.projectBaseDir=${repoDir}` as an explicit argument ensures the scanner knows where to look.

## Correctness Properties

Property 1: Bug Condition - Scanner Discovery and Invocation

_For any_ scan invocation where `sonar-scanner` is installed at `/opt/homebrew/bin/sonar-scanner` and the runtime PATH does not include `/opt/homebrew/bin`, the fixed `findSonarScanner()` function SHALL locate the binary at that path and `runSonarScanner()` SHALL invoke it with proper arguments so that the scanner analyzes the repository and produces findings (or logs a meaningful error).

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Preservation - Non-Homebrew Scanner Discovery and Existing Behavior

_For any_ scan invocation where the bug condition does NOT hold (scanner is in system PATH, or SonarQube is not configured, or scanner is not installed), the fixed code SHALL produce exactly the same behavior as the original code, preserving PATH-based discovery, graceful skip behavior, Semgrep scanning, and custom rules scanning.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `code-analysis/code-analysis.ts`

**Function**: `findSonarScanner()` (~line 820)

**Specific Changes**:
1. **Add Homebrew candidate path**: Add `"/opt/homebrew/bin/sonar-scanner"` to the `candidates` array, ideally before the less common paths but after the bare `"sonar-scanner"` PATH lookup:
   ```typescript
   const candidates = [
     "sonar-scanner",
     join(process.env.HOME || "", ".sonar/native-sonar-scanner/sonar-scanner"),
     "/usr/local/bin/sonar-scanner",
     "/opt/homebrew/bin/sonar-scanner",  // macOS Homebrew (Apple Silicon)
     "/opt/sonar-scanner/bin/sonar-scanner",
   ];
   ```

**Function**: `runSonarScanner()` (~line 870)

**Specific Changes**:
2. **Add scanner arguments**: Change the `execSync` invocation to pass the `-Dsonar.projectBaseDir` argument pointing to `repoDir`:
   ```typescript
   execSync(`${JSON.stringify(scannerBin)} -Dsonar.projectBaseDir=${JSON.stringify(repoDir)}`, {
     cwd: repoDir,
     timeout: 300_000,
     stdio: "pipe",
     env: { ...process.env },
   });
   ```
   This ensures the scanner explicitly knows where to find the project and its `sonar-project.properties` file.

**Function**: `runScan` endpoint (~line 413)

**Specific Changes**:
3. **Fix parameter name mismatch**: Update the endpoint parameter type to accept `enableOpengrep` (matching the frontend) and map it to the internal `semgrep` tool flag:
   ```typescript
   async (params: { scanId: string; enableOpengrep?: boolean; enableSonarqube?: boolean; enableCustomRules?: boolean }): Promise<Scan> => {
     // ...
     const tools = {
       semgrep: params.enableOpengrep !== false,
       sonarqube: params.enableSonarqube !== false,
       customRules: params.enableCustomRules !== false,
     };
   ```
   Alternatively, accept both `enableOpengrep` and `enableSemgrep` for backward compatibility and prefer `enableOpengrep` when present.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that mock the filesystem and `spawnSync`/`execSync` to simulate the scanner discovery and invocation. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **Homebrew Path Discovery Test**: Mock filesystem with sonar-scanner only at `/opt/homebrew/bin/sonar-scanner`. Call `findSonarScanner()` — will return `null` on unfixed code (will fail on unfixed code)
2. **Scanner Invocation Args Test**: Capture the command string passed to `execSync` in `runSonarScanner()`. Assert it contains `-Dsonar.projectBaseDir` — will fail on unfixed code because only the binary path is passed
3. **Parameter Mismatch Test**: Send a request with `enableOpengrep: false` to the `runScan` endpoint. Assert that Semgrep/Opengrep scanning is disabled — will fail on unfixed code because `enableSemgrep` is checked instead
4. **Combined Discovery + Invocation Test**: Mock scanner at Homebrew path, run full `runSonarScanner()` flow — will fail on unfixed code because binary is not found

**Expected Counterexamples**:
- `findSonarScanner()` returns `null` when only `/opt/homebrew/bin/sonar-scanner` exists
- `execSync` is called with just `'"/path/to/sonar-scanner"'` and no arguments
- `params.enableSemgrep` is `undefined` when frontend sends `enableOpengrep`

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := runSonarScanner_fixed(input.repoDir, input.projectKey)
  ASSERT scannerBinaryFound(result) = true
  ASSERT execSyncCommand CONTAINS "-Dsonar.projectBaseDir"
  ASSERT result.filesAnalyzed > 0 OR result.errorLogged = true
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT findSonarScanner_original(input) = findSonarScanner_fixed(input)
  ASSERT runSonarScanner_original(input) = runSonarScanner_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (various PATH configurations, scanner locations, parameter combinations)
- It catches edge cases that manual unit tests might miss (e.g., empty PATH, missing HOME env var)
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for non-Homebrew scanner paths and non-Opengrep parameters, then write property-based tests capturing that behavior.

**Test Cases**:
1. **PATH-based Discovery Preservation**: Verify that when `sonar-scanner` is in system PATH, `findSonarScanner()` still finds it via the bare command candidate — observe on unfixed code, then verify after fix
2. **Graceful Skip Preservation**: Verify that when SonarQube URL/token is not configured, `runSonarScanner()` returns `[]` without error — observe on unfixed code, then verify after fix
3. **No Binary Preservation**: Verify that when no scanner binary exists at any path, `findSonarScanner()` returns `null` — observe on unfixed code, then verify after fix
4. **Semgrep Independence Preservation**: Verify that Semgrep scanning produces identical results regardless of SonarQube changes — observe on unfixed code, then verify after fix
5. **Properties File Preservation**: Verify that `sonar-project.properties` is still written with correct content before scanner invocation

### Unit Tests

- Test `findSonarScanner()` with mocked `spawnSync` for each candidate path including the new Homebrew path
- Test `runSonarScanner()` captures the correct `execSync` command string with arguments
- Test `runScan` endpoint correctly maps `enableOpengrep` to the internal `semgrep` tool flag
- Test edge cases: scanner binary exists but `--version` fails, scanner binary path contains spaces

### Property-Based Tests

- Generate random PATH configurations and scanner installation locations; verify `findSonarScanner()` returns the correct binary or `null`
- Generate random combinations of `enableOpengrep`/`enableSemgrep`/`enableSonarqube`/`enableCustomRules` parameters; verify the tools object is correctly constructed
- Generate random `repoDir` paths (with spaces, special characters); verify the `execSync` command is properly quoted and includes the correct arguments

### Integration Tests

- Test full scan flow with a real sonar-scanner binary at `/opt/homebrew/bin/sonar-scanner` against a local SonarQube instance
- Test that scan results contain actual findings when scanner is properly invoked
- Test that the frontend toggle for Opengrep correctly enables/disables the scanner through the full API call chain
