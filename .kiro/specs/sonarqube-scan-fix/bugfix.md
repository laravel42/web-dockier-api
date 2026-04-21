# Bugfix Requirements Document

## Introduction

SonarQube scans complete with `filesScanned: 0, totalFindings: 0` despite the repository containing files. The root cause is twofold: (1) `findSonarScanner()` does not check `/opt/homebrew/bin/sonar-scanner` and relies on a bare `"sonar-scanner"` PATH lookup that fails in Encore's runtime environment, and (2) `runSonarScanner()` invokes the binary without any command-line arguments, causing the scanner to not actually perform analysis. A secondary issue is a type mismatch between the frontend (`enableOpengrep`) and backend (`enableSemgrep`) parameter names.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN `sonar-scanner` is installed at `/opt/homebrew/bin/sonar-scanner` and Encore's runtime PATH does not include `/opt/homebrew/bin` THEN the system fails to locate the sonar-scanner binary and silently returns zero findings

1.2 WHEN `findSonarScanner()` returns a valid binary path THEN the system invokes the binary with no arguments (only the quoted binary path), causing the scanner to exit without performing analysis

1.3 WHEN the frontend sends `enableOpengrep` in the `runScan` request body THEN the system ignores it because the backend parameter is named `enableSemgrep`, resulting in the Semgrep/Opengrep tool toggle having no effect

1.4 WHEN `findSonarScanner()` checks candidate paths THEN the system does not check `/opt/homebrew/bin/sonar-scanner` or `/opt/homebrew/bin` in the PATH, missing the standard Homebrew installation location on macOS

### Expected Behavior (Correct)

2.1 WHEN `sonar-scanner` is installed at `/opt/homebrew/bin/sonar-scanner` THEN the system SHALL locate and use that binary successfully

2.2 WHEN `runSonarScanner()` invokes the sonar-scanner binary THEN the system SHALL pass the required `-Dsonar.projectBaseDir` argument (or rely on the working directory with proper invocation) so that the scanner analyzes the repository files

2.3 WHEN the frontend sends `enableOpengrep` in the `runScan` request body THEN the system SHALL correctly interpret it as the toggle for the Semgrep/Opengrep scanning tool

2.4 WHEN `findSonarScanner()` checks candidate paths THEN the system SHALL include `/opt/homebrew/bin/sonar-scanner` as a candidate path to support standard Homebrew installations on macOS

### Unchanged Behavior (Regression Prevention)

3.1 WHEN `sonar-scanner` is available in the system PATH (non-Homebrew installation) THEN the system SHALL CONTINUE TO find and use it via the existing PATH-based lookup

3.2 WHEN SonarQube URL or token is not configured THEN the system SHALL CONTINUE TO skip SonarQube scanning gracefully and log a message

3.3 WHEN `findSonarScanner()` cannot find any sonar-scanner binary THEN the system SHALL CONTINUE TO return null and skip SonarQube scanning without crashing

3.4 WHEN Semgrep scanning is enabled and working THEN the system SHALL CONTINUE TO produce Semgrep findings correctly regardless of SonarQube scanner changes

3.5 WHEN custom rules scanning is enabled THEN the system SHALL CONTINUE TO produce custom rule findings correctly regardless of SonarQube scanner changes

---

## Bug Condition (Formal)

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ScanRequest
  OUTPUT: boolean
  
  // Returns true when sonar-scanner is only available at a Homebrew path
  // OR when the scanner is found but invoked without arguments
  RETURN (X.sonarScannerPath = "/opt/homebrew/bin/sonar-scanner" 
          AND "/opt/homebrew/bin" NOT IN X.runtimePATH)
         OR (X.scannerBinFound = true AND X.scannerInvokedWithoutArgs = true)
END FUNCTION
```

```pascal
// Property: Fix Checking - Scanner Discovery
FOR ALL X WHERE isBugCondition(X) DO
  result ← runSonarScanner'(X.repoDir, X.projectKey)
  ASSERT scannerBinaryFound(result) = true
  ASSERT scannerInvokedWithArgs(result) = true
  ASSERT result.filesAnalyzed > 0 OR result.errorLogged = true
END FOR
```

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT runSonarScanner(X) = runSonarScanner'(X)
END FOR
```
