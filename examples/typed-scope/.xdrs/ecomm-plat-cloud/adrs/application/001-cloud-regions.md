---
name: ecomm-plat-cloud-adr-policy-001-cloud-regions
description: Defines available cloud deployment regions for the ecomm platform and the constraints that govern region selection for new workloads.
apply-to: All ecomm teams deploying new services or expanding existing ones
valid-from: 2026-07-06
---

# ecomm-plat-cloud-adr-policy-001: Cloud regions

## Context and Problem Statement

The ecomm platform runs on a shared cloud infrastructure with multiple available regions. Not all regions have the same capabilities, network peering arrangements, or compliance certifications. Teams deploying new workloads need clear guidance on which regions are available and what constraints apply to each.

Which cloud regions are available for ecomm workloads and how MUST teams select a region?

## Decision Outcome

**Teams MUST deploy new ecomm workloads to an approved region listed in this policy and MUST NOT deploy to unapproved regions without a documented exception.**

### Details

#### 01-primary-region

`eu-west-1` is the primary region for all ecomm workloads. New services MUST deploy to `eu-west-1` unless they qualify for secondary-region deployment under rule `02-secondary-region`.

#### 02-secondary-region

`us-east-1` is the approved secondary region. A service MAY deploy to `us-east-1` when it serves a North American user base or requires co-location with a third-party integration hosted in that region. The decision to use a secondary region MUST be documented in the service's scope policies.

#### 03-unapproved-regions

All other regions are unapproved. Deployment to an unapproved region MUST be raised as an exception through the platform team with a written justification before any infrastructure is provisioned.

#### 04-data-residency

Workloads processing personal data of EU residents MUST remain in `eu-west-1` to satisfy GDPR data residency requirements. These workloads MUST NOT replicate personal data to `us-east-1` or any other region outside the EU without explicit legal approval.

#### 05-multi-region-failover

Services with a stated SLA of 99.9% or higher SHOULD implement active-passive failover across `eu-west-1` and `eu-central-1`. The failover configuration MUST be tested at least quarterly.

## References

- Platform infrastructure runbook — internal link (not public)
