---
name: _local-adr-policy-001-local-dev-overrides
description: Workspace-local overrides for development and testing. Defines which gateway sandbox credentials to use locally and overrides the primary region for local runs.
apply-to: This workspace only; not for production or shared environments
valid-from: 2026-07-06
---

# _local-adr-policy-001: Local dev overrides

## Context and Problem Statement

Running the checkout flow locally requires connecting to a payment gateway sandbox and a mock cloud region. Using production credentials or real regions in local development creates risk and unnecessary cost.

Which overrides apply to this local workspace for development and testing?

## Decision Outcome

**Use the Stripe test mode sandbox and the local mock region `local-mock-1` for all local development runs in this workspace.**

These overrides apply to this workspace only and MUST NOT be committed to any shared or production configuration.

### Details

#### 01-gateway-sandbox

Local development MUST use Stripe test mode. The test API key MUST be loaded from the local `.env` file and MUST NOT be committed to version control.

#### 02-region-override

Local runs MAY use `local-mock-1` as a fake region identifier when the cloud SDK is mocked. This overrides `ecomm-plat-cloud-adr-policy-001.01-primary-region` for local testing only.

#### 03-no-production-data

This workspace MUST NOT connect to production databases, real payment endpoints, or live cloud resources during local development. Any attempt to do so MUST be blocked at the environment configuration level.
