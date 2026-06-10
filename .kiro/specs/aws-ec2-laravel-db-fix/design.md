# AWS EC2 Laravel DB Credential Mismatch Bugfix Design

## Overview

Laravel projects deployed to AWS EC2 via the VPS strategy fail at runtime because user-provided database credentials never reach the provisioned database or Docker container. The bug has three root causes: (1) `aws-deploy.ts` omits `event.envVars` from the SNS message, so `EnvVarsJson` stays at its default `'[]'`; (2) `ec2.yml` step `02_self_hosted_services` always creates the database with hardcoded credentials regardless of `EnvVarsJson`; (3) `ec2.yml` step `03_deploy_container` places `$SVC_FLAGS` after `$ENV_FLAGS`, so hardcoded service values silently overwrite user values. The fix addresses all three defects with minimal, targeted changes.

## Glossary

- **Bug_Condition (C)**: A deploy where the user provides custom DB credentials (`DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) via `envVars` and deploys to AWS EC2 with a self-hosted database service — the credentials are ignored at every stage of the pipeline.
- **Property (P)**: User-provided DB credentials flow through the SNS message, are used to create the database on the EC2 instance, and are available to the Docker container (overriding service defaults).
- **Preservation**: Deploys without custom DB credentials continue to use defaults (`appdb`/`appuser`/`apppass123`). ECS deploys, Pulumi/GCP deploys, non-database services, and non-database env vars remain unchanged.
- **`handleAwsDeploy`**: The function in `deploy/processor/aws-deploy.ts` that zips the repo, uploads to S3, and publishes an SNS message to trigger CodeBuild.
- **`ec2.yml`**: The CloudFormation template at `image-builder/deploy-templates/ec2.yml` that provisions the EC2 instance, installs self-hosted services, and runs the Docker container.
- **`EnvVarsJson`**: A CloudFormation parameter (JSON array of `{name, value}` objects) that carries user environment variables into the EC2 provisioning scripts.
- **`$SVC_FLAGS` / `$ENV_FLAGS`**: Shell variables in `ec2.yml` step `03_deploy_container` that hold Docker `-e` flags for service defaults and user env vars respectively.

## Bug Details

### Bug Condition

The bug manifests when a user deploys a Laravel project to AWS EC2 with custom database environment variables. The pipeline has three independent failures: (1) `handleAwsDeploy` does not include `event.envVars` in the SNS message `deployParams`, so `EnvVarsJson` is always `'[]'`; (2) even if `EnvVarsJson` were populated, step `02_self_hosted_services` ignores `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` and always creates the database with hardcoded values; (3) even if the container received user env vars, `$SVC_FLAGS` comes after `$ENV_FLAGS` in the `docker run` command, so hardcoded values overwrite user values.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type DeployEvent with envVars and deployStrategy
  OUTPUT: boolean

  hasCustomDbCreds := EXISTS var IN input.envVars
    WHERE var.name IN ['DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD']
  isAwsEc2 := input.provider == 'aws' AND input.deployStrategy == 'vps'
  hasDatabaseService := 'database' IN input.selfHostedServices

  RETURN hasCustomDbCreds AND isAwsEc2 AND hasDatabaseService
END FUNCTION
```

### Examples

- **MySQL with custom creds**: User sets `DB_DATABASE=myapp`, `DB_USERNAME=admin`, `DB_PASSWORD=secret123`, deploys to AWS EC2 with MySQL. Expected: MySQL creates database `myapp` with user `admin`. Actual: MySQL creates database `appdb` with user `appuser`, container connects with `appdb`/`appuser`/`apppass123`.
- **PostgreSQL with custom creds**: User sets `DB_DATABASE=proddb`, `DB_USERNAME=pgadmin`, `DB_PASSWORD=pgpass`, `DB_CONNECTION=pgsql`. Expected: PostgreSQL creates database `proddb` with user `pgadmin`. Actual: PostgreSQL creates database `appdb` with user `appuser`.
- **Partial custom creds**: User sets only `DB_PASSWORD=newsecret` but leaves `DB_DATABASE` and `DB_USERNAME` unset. Expected: Database uses `appdb`/`appuser`/`newsecret` (defaults for unset, user value for set). Actual: All three use hardcoded defaults.
- **No custom creds (not a bug)**: User deploys without setting any DB env vars. Expected and actual: defaults `appdb`/`appuser`/`apppass123` are used — this is correct behavior.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Deploys without custom DB env vars continue to create `appdb`/`appuser`/`apppass123`
- ECS (managed) deploys use their own CloudFormation template and env var injection unchanged
- Direct build API path (`image-builder/endpoints/builds.ts`) continues to forward `deployParams.envVars` as it does today
- Non-database env vars (`APP_KEY`, `APP_URL`, `MAIL_HOST`, etc.) continue to pass through `$ENV_FLAGS`
- Self-hosted cache (Redis), queue, and scheduler services continue to work unchanged
- Pulumi/GCP deploy path operates independently and is not affected

**Scope:**
All inputs that do NOT involve AWS EC2 deploys with custom database credentials should be completely unaffected by this fix. This includes:
- ECS deploys (different CloudFormation template)
- GCP/Pulumi deploys (completely separate code path)
- EC2 deploys without self-hosted database service
- EC2 deploys without custom DB env vars (defaults still apply)

## Hypothesized Root Cause

Based on the bug description and code analysis, there are three confirmed root causes:

1. **Missing `envVars` in SNS message** (`deploy/processor/aws-deploy.ts`): The `deployParams` object constructed at line ~100 only includes `appName`, `containerPort`, `instanceType`, `cpu`, and `memory`. It does not include `event.envVars`, `event.techStack`, or self-hosted services. The `image-builder/infra/cloudformation.yml` Lambda reads `deployParams.envVars` to populate the `EnvVarsJson` CloudFormation parameter, but since `envVars` is never sent, `EnvVarsJson` stays at its default `'[]'`. The reference implementation in `image-builder/shared.ts` (`StartBuildParams.deployParams`) already defines `envVars`, `selfHostedServices`, and `techStack` fields — they just aren't populated by `aws-deploy.ts`.

2. **Hardcoded DB credentials in step `02_self_hosted_services`** (`image-builder/deploy-templates/ec2.yml`): The MySQL and PostgreSQL setup blocks always use `appdb`/`appuser`/`apppass123`. The template already parses `DB_CONNECTION` from `EnvVarsJson` to detect the DB engine, but does not parse `DB_DATABASE`, `DB_USERNAME`, or `DB_PASSWORD`. The Pulumi path (`deploy/pulumi-templates/user-data.ts`) uses placeholder variables (`__DEPLOY_DB_NAME__`, `__DEPLOY_DB_USER__`, `__DEPLOY_DB_PASS__`) that get replaced at deploy time — the CloudFormation path needs equivalent logic using `EnvVarsJson`.

3. **Wrong env var override order in step `03_deploy_container`** (`image-builder/deploy-templates/ec2.yml`): The `docker run` command uses `$ENV_FLAGS $SVC_FLAGS`, placing service defaults (`$SVC_FLAGS`) after user values (`$ENV_FLAGS`). Docker uses the last `-e` flag for duplicate keys, so hardcoded values always win. The Pulumi path (`user-data.ts`) correctly uses `defaultEnvFlags → userEnvPlaceholder → overrideEnvFlags` ordering. The fix is to swap to `$SVC_FLAGS $ENV_FLAGS` so user values override service defaults.

## Correctness Properties

Property 1: Bug Condition - User DB credentials flow through the pipeline

_For any_ deploy event where the user provides custom database credentials (`DB_DATABASE`, `DB_USERNAME`, or `DB_PASSWORD` in `envVars`), deploys to AWS EC2 with a self-hosted database service, the fixed pipeline SHALL: (a) include `envVars` in the SNS message `deployParams`, (b) use the user-provided values to create the database/user on the EC2 instance, and (c) ensure the Docker container receives the user's values (not hardcoded defaults) for any duplicate keys.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Default credentials and non-DB behavior unchanged

_For any_ deploy event where the user does NOT provide custom database credentials, or deploys via ECS/Pulumi/GCP, or deploys without a self-hosted database service, the fixed code SHALL produce the same result as the original code, preserving default credential behavior (`appdb`/`appuser`/`apppass123`), ECS template logic, Pulumi/GCP paths, non-database env var passthrough, and Redis/queue/scheduler service configuration.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

**File 1**: `deploy/processor/aws-deploy.ts`

**Function**: `handleAwsDeploy`

**Specific Changes**:
1. **Include `event.envVars` in `deployParams`**: Add `envVars: event.envVars || []` to the `deployParams` object so user environment variables flow through the SNS → CodeBuild → Lambda → CloudFormation pipeline.
2. **Include self-hosted services**: Add `selfHostedServices: event.techStack?.includes('Laravel') ? ['database'] : []` or derive from the deploy event context. The `image-builder/infra/cloudformation.yml` Lambda already reads `deployParams.selfHostedServices` and `deployParams.techStack` to set CloudFormation parameters.
3. **Include tech stack**: Add `techStack: event.techStack || []` to `deployParams`.

**Concrete change** — in the `deployParams` construction block (around line 100):
```typescript
// Before:
const deployParams: Record<string, any> = { appName: repoName, containerPort: ctx.repoConfig.port || 3000 };
if (deployTarget === "ecs") { deployParams.cpu = "512"; deployParams.memory = "1024"; }
if (deployTarget === "ec2") { deployParams.instanceType = "t3.small"; }

// After:
const deployParams: Record<string, any> = { appName: repoName, containerPort: ctx.repoConfig.port || 3000 };
if (deployTarget === "ecs") { deployParams.cpu = "512"; deployParams.memory = "1024"; }
if (deployTarget === "ec2") { deployParams.instanceType = "t3.small"; }
if (event.envVars && event.envVars.length > 0) { deployParams.envVars = event.envVars; }
if (event.techStack && event.techStack.length > 0) { deployParams.techStack = event.techStack; }
// Derive selfHostedServices from the deploy event context
// The image-builder Lambda reads this to set the SelfHostedServices CFN parameter
const selfHostedServices: string[] = [];
// Database service is needed when tech stack includes Laravel or user has DB env vars
const hasDbEnvVars = (event.envVars || []).some(v => ['DB_CONNECTION', 'DB_DATABASE', 'DB_HOST'].includes(v.name));
if (event.techStack?.some(t => t.toLowerCase() === 'laravel') || hasDbEnvVars) {
  selfHostedServices.push('database');
}
if (selfHostedServices.length > 0) { deployParams.selfHostedServices = selfHostedServices; }
```

---

**File 2**: `image-builder/deploy-templates/ec2.yml`

**Step**: `02_self_hosted_services`

**Specific Changes**:
1. **Parse user DB credentials from `EnvVarsJson`**: Before the MySQL/PostgreSQL setup blocks, extract `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` from `EnvVarsJson` using the same `python3 -c` pattern already used for `DB_CONNECTION`. Fall back to defaults when not provided.
2. **Use parsed credentials for MySQL setup**: Replace hardcoded `appdb`/`appuser`/`apppass123` with the parsed variables.
3. **Use parsed credentials for PostgreSQL setup**: Replace hardcoded `appdb`/`appuser`/`apppass123` with the parsed variables.

**Concrete change** — add credential parsing after the `DB_ENGINE` detection block, before the `if [ "$DB_ENGINE" = "pgsql" ]` branch:
```bash
# Parse user DB credentials from EnvVarsJson, fall back to defaults
USER_DB_NAME=$(echo '${EnvVarsJson}' | python3 -c "
import sys, json
try:
  evs = json.load(sys.stdin)
  for e in evs:
    if e.get('name') == 'DB_DATABASE':
      print(e.get('value', ''))
      break
except: pass
" 2>/dev/null)
USER_DB_USER=$(echo '${EnvVarsJson}' | python3 -c "
import sys, json
try:
  evs = json.load(sys.stdin)
  for e in evs:
    if e.get('name') == 'DB_USERNAME':
      print(e.get('value', ''))
      break
except: pass
" 2>/dev/null)
USER_DB_PASS=$(echo '${EnvVarsJson}' | python3 -c "
import sys, json
try:
  evs = json.load(sys.stdin)
  for e in evs:
    if e.get('name') == 'DB_PASSWORD':
      print(e.get('value', ''))
      break
except: pass
" 2>/dev/null)
DB_NAME="${USER_DB_NAME:-appdb}"
DB_USER="${USER_DB_USER:-appuser}"
DB_PASS="${USER_DB_PASS:-apppass123}"
```

Then replace hardcoded values in the MySQL block:
```bash
# Before:
sudo -u postgres psql -c "CREATE USER appuser WITH PASSWORD 'apppass123';"
sudo -u postgres psql -c "CREATE DATABASE appdb OWNER appuser;"

# After:
sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
```

And similarly for MySQL:
```bash
# Before:
mysql -e "CREATE DATABASE IF NOT EXISTS appdb;"
mysql -e "CREATE USER IF NOT EXISTS 'appuser'@'%' IDENTIFIED BY 'apppass123';"
mysql -e "GRANT ALL PRIVILEGES ON appdb.* TO 'appuser'@'%';"

# After:
mysql -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
mysql -e "CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';"
mysql -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'%';"
```

Also update the `pg_hba.conf` entry and echo messages to use `$DB_USER` instead of `appuser`.

---

**Step**: `03_deploy_container`

**Specific Changes**:
1. **Swap `$SVC_FLAGS` and `$ENV_FLAGS` order**: Change the `docker run` command to place `$SVC_FLAGS` before `$ENV_FLAGS` so user values override service defaults.
2. **Update `$SVC_FLAGS` DB credentials to use parsed values**: Replace hardcoded `appdb`/`appuser`/`apppass123` in `$SVC_FLAGS` with the same parsed variables from `EnvVarsJson`, so the defaults injected by `$SVC_FLAGS` match what was actually created on the host.

**Concrete change** — in the `docker run` command:
```bash
# Before:
docker run -d \
  --name ${AppName} \
  --restart unless-stopped \
  -p 127.0.0.1:8080:${ContainerPort} \
  --add-host=host.docker.internal:host-gateway \
  -e PORT=${ContainerPort} \
  $ENV_FLAGS \
  $SVC_FLAGS \
  "${ImageUri}"

# After:
docker run -d \
  --name ${AppName} \
  --restart unless-stopped \
  -p 127.0.0.1:8080:${ContainerPort} \
  --add-host=host.docker.internal:host-gateway \
  -e PORT=${ContainerPort} \
  $SVC_FLAGS \
  $ENV_FLAGS \
  "${ImageUri}"
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that verify the SNS message content from `handleAwsDeploy`, the shell script output from `ec2.yml` credential parsing, and the `docker run` flag ordering. Run these tests on the UNFIXED code to observe failures.

**Test Cases**:
1. **SNS Message Missing envVars**: Call `handleAwsDeploy` with `event.envVars = [{name: 'DB_DATABASE', value: 'myapp'}]` and verify the SNS message `deployParams` does NOT contain `envVars` (will confirm bug on unfixed code)
2. **MySQL Hardcoded Credentials**: Parse the `ec2.yml` step `02_self_hosted_services` MySQL block and verify it always uses `appdb`/`appuser`/`apppass123` regardless of `EnvVarsJson` content (will confirm bug on unfixed code)
3. **PostgreSQL Hardcoded Credentials**: Same as above for the PostgreSQL block (will confirm bug on unfixed code)
4. **Docker Run Flag Order**: Parse the `ec2.yml` step `03_deploy_container` and verify `$ENV_FLAGS` appears before `$SVC_FLAGS` in the `docker run` command (will confirm bug on unfixed code)

**Expected Counterexamples**:
- SNS message `deployParams` object lacks `envVars` field entirely
- MySQL/PostgreSQL setup scripts contain literal `appdb`/`appuser`/`apppass123` with no variable substitution
- `docker run` command has `$ENV_FLAGS $SVC_FLAGS` ordering (user values overwritten)

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  snsMessage := handleAwsDeploy_fixed(input)
  ASSERT snsMessage.deployParams.envVars == input.envVars
  
  dbSetup := renderEc2Template_fixed(input.envVars)
  ASSERT dbSetup.dbName == getUserValue(input.envVars, 'DB_DATABASE', 'appdb')
  ASSERT dbSetup.dbUser == getUserValue(input.envVars, 'DB_USERNAME', 'appuser')
  ASSERT dbSetup.dbPass == getUserValue(input.envVars, 'DB_PASSWORD', 'apppass123')
  
  dockerCmd := renderDockerRun_fixed(input.envVars)
  ASSERT dockerCmd.svcFlagsIndex < dockerCmd.envFlagsIndex
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT handleAwsDeploy_original(input).snsMessage == handleAwsDeploy_fixed(input).snsMessage
  // (excluding the new envVars/techStack/selfHostedServices fields which are additive)
  
  ASSERT renderEc2Template_original(emptyEnvVars) == renderEc2Template_fixed(emptyEnvVars)
  // Default credentials appdb/appuser/apppass123 are used when no user vars provided
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many combinations of env var sets (with and without DB credentials) automatically
- It catches edge cases like partial credential sets, empty values, special characters in passwords
- It provides strong guarantees that default behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for deploys without custom DB credentials, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Default Credentials Preservation**: Verify that when `envVars` is empty or contains no DB-related vars, the database is created with `appdb`/`appuser`/`apppass123` — same as before the fix
2. **ECS Deploy Preservation**: Verify that ECS deploys are completely unaffected by the changes to `ec2.yml` and `aws-deploy.ts`
3. **Non-DB Env Vars Preservation**: Verify that env vars like `APP_KEY`, `APP_URL`, `MAIL_HOST` continue to pass through `$ENV_FLAGS` unchanged
4. **Redis/Queue/Scheduler Preservation**: Verify that cache, queue, and scheduler service setup and env var injection remain unchanged

### Unit Tests

- Test `handleAwsDeploy` SNS message construction includes `envVars` in `deployParams` when present
- Test `handleAwsDeploy` SNS message omits `envVars` from `deployParams` when `event.envVars` is empty/undefined
- Test credential parsing logic: extract `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD` from a JSON array
- Test credential fallback: when env vars are missing, defaults `appdb`/`appuser`/`apppass123` are used
- Test partial credentials: only `DB_PASSWORD` set, others fall back to defaults
- Test special characters in passwords (quotes, spaces, dollar signs)

### Property-Based Tests

- Generate random sets of env vars (with and without DB credentials) and verify the SNS message always includes them when present
- Generate random `EnvVarsJson` arrays and verify the credential parsing always extracts the correct values or falls back to defaults
- Generate random env var combinations and verify the `docker run` flag ordering always places `$SVC_FLAGS` before `$ENV_FLAGS`

### Integration Tests

- Test full deploy flow: user provides `DB_DATABASE=myapp`, `DB_USERNAME=admin`, `DB_PASSWORD=secret` → verify SNS message → verify CloudFormation parameters → verify database creation → verify Docker container env vars
- Test deploy flow without custom DB credentials → verify defaults are used throughout
- Test deploy flow with ECS strategy → verify no changes to ECS behavior
