# Bugfix Requirements Document

## Introduction

Laravel projects deployed to AWS EC2 via the VPS strategy fail at runtime with `SQLSTATE[42S02]: Base table or view not found: 1146 Table 'appdb.pages' doesn't exist`. The root cause is a three-part credential mismatch in the AWS EC2 deploy pipeline: the MySQL/PostgreSQL database is always created with hardcoded credentials (`appdb`/`appuser`/`apppass123`) regardless of user-provided environment variables, the Docker container's env var override order causes hardcoded service flags to silently overwrite user values, and the SNS message published by `deploy/processor/aws-deploy.ts` omits `event.envVars` entirely so user credentials never reach CloudFormation. Together, these defects mean user-configured database names, usernames, and passwords are ignored — the database is created as `appdb` and the container always connects with `appdb`/`appuser`/`apppass123`.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user deploys a Laravel project to AWS EC2 with custom database environment variables (e.g. `DB_DATABASE=myapp`, `DB_USERNAME=myuser`, `DB_PASSWORD=secret`) THEN the system creates the MySQL database with hardcoded credentials (`appdb`/`appuser`/`apppass123`) in the CloudFormation `ec2.yml` template step `02_self_hosted_services`, ignoring the user's `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` values from `EnvVarsJson`

1.2 WHEN a user deploys a Laravel project to AWS EC2 with custom database environment variables THEN the system creates the PostgreSQL database with hardcoded credentials (`appdb`/`appuser`/`apppass123`) in the CloudFormation `ec2.yml` template step `02_self_hosted_services`, ignoring the user's `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` values from `EnvVarsJson`

1.3 WHEN a user deploys to AWS EC2 with custom environment variables (including `DB_DATABASE`, `DB_USERNAME`, `DB_PASSWORD`) THEN the Docker container is started with `$ENV_FLAGS $SVC_FLAGS` where `$SVC_FLAGS` (hardcoded values like `-e DB_DATABASE=appdb`) comes AFTER `$ENV_FLAGS` (user values), and Docker uses the last `-e` flag for duplicate keys, so the hardcoded service values always override the user's values

1.4 WHEN a user deploys via the `deploy/processor/aws-deploy.ts` path (the deploy service pub/sub handler) THEN the SNS message published to the `image-builder-build-request` topic does not include `event.envVars`, so user environment variables are never forwarded through the CodeBuild → CloudFormation pipeline and the `EnvVarsJson` CloudFormation parameter remains at its default empty value `'[]'`

### Expected Behavior (Correct)

2.1 WHEN a user deploys a Laravel project to AWS EC2 with custom database environment variables THEN the system SHALL parse `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` from `EnvVarsJson` in the CloudFormation `ec2.yml` template step `02_self_hosted_services` and use those values to create the MySQL database, user, and grant privileges — falling back to defaults (`appdb`/`appuser`/`apppass123`) only when the user has not provided those variables

2.2 WHEN a user deploys a Laravel project to AWS EC2 with custom database environment variables THEN the system SHALL parse `DB_DATABASE`, `DB_USERNAME`, and `DB_PASSWORD` from `EnvVarsJson` in the CloudFormation `ec2.yml` template step `02_self_hosted_services` and use those values to create the PostgreSQL database and user — falling back to defaults (`appdb`/`appuser`/`apppass123`) only when the user has not provided those variables

2.3 WHEN a user deploys to AWS EC2 with custom environment variables THEN the Docker container SHALL be started with `$SVC_FLAGS` BEFORE `$ENV_FLAGS` in the `docker run` command (step `03_deploy_container`), so that user-provided values in `$ENV_FLAGS` override the hardcoded service defaults in `$SVC_FLAGS` for duplicate keys

2.4 WHEN a user deploys via the `deploy/processor/aws-deploy.ts` path THEN the SNS message published to the `image-builder-build-request` topic SHALL include `event.envVars` inside the `deployParams` object (as `deployParams.envVars`), so that user environment variables flow through the CodeBuild → Lambda DeployTrigger → CloudFormation pipeline and populate the `EnvVarsJson` parameter correctly

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user deploys a Laravel project to AWS EC2 without providing custom database environment variables THEN the system SHALL CONTINUE TO create the database with default credentials (`appdb`/`appuser`/`apppass123`) and the container SHALL CONTINUE TO connect using those defaults

3.2 WHEN a user deploys to AWS EC2 with the ECS (managed) strategy THEN the system SHALL CONTINUE TO use the existing ECS CloudFormation template and env var injection logic unchanged

3.3 WHEN a user deploys via the `image-builder/endpoints/builds.ts` API path (direct build API) THEN the system SHALL CONTINUE TO forward `deployParams` (including `envVars`) through the SNS → CodeBuild → CloudFormation pipeline as it does today

3.4 WHEN a user deploys to AWS EC2 with non-database environment variables (e.g. `APP_KEY`, `APP_URL`, `MAIL_HOST`) THEN the system SHALL CONTINUE TO pass those variables to the Docker container via `$ENV_FLAGS`

3.5 WHEN a user deploys to AWS EC2 with self-hosted cache (Redis), queue, or scheduler services THEN the system SHALL CONTINUE TO configure those services and inject their connection env vars (`REDIS_HOST`, `QUEUE_CONNECTION`, etc.) into the Docker container

3.6 WHEN a user deploys via the Pulumi/GCP path (`handlePulumiDeploy`) THEN the system SHALL CONTINUE TO operate unchanged since it uses a completely separate code path
